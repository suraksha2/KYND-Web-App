// npm run build && node scripts/migrate-vendor-finance.mjs [--apply]
// Default: read-only report. --apply adds the table and snapshots OPEN direct
// bookings only. Completed work and existing jobs/payouts are never repriced.
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
const require = createRequire(import.meta.url);
const pool = require('../dist/lib/mysql').default;
const { approvedVendorQuote, assignVendorFinancials, VendorPricingError } = require('../dist/lib/vendorFinance');
const apply = process.argv.includes('--apply');

try {
  if (apply) {
    const schema = await fs.readFile(new URL('../db.sql', import.meta.url), 'utf8');
    const ddl = schema.match(/CREATE TABLE IF NOT EXISTS vendor_booking_financials \([\s\S]*?\n\);/)?.[0];
    if (!ddl) throw new Error('Vendor finance table definition not found.');
    await pool.query(ddl);
  }
  const [tables] = await pool.query("SHOW TABLES LIKE 'vendor_booking_financials'");
  const [rows] = await pool.query(`
    SELECT b.id, b.items, b.total, b.schedule, b.status, b.provider_id, sp.vendor_id
      FROM bookings b
      LEFT JOIN service_providers sp ON sp.id = b.provider_id
     WHERE b.vendor_id IS NULL AND b.status <> 'cancelled'
       AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.booking_id = b.id)
       AND (sp.vendor_id IS NOT NULL OR EXISTS (
         SELECT 1 FROM booking_occurrences o JOIN service_providers p ON p.id = o.provider_id
          WHERE o.booking_id = b.id AND p.vendor_id IS NOT NULL))
     ORDER BY b.id`);
  const report = { mode: apply ? 'applied to open visits' : 'read-only', saved: 0, missingRates: [], historicalVisits: 0 };
  for (const booking of rows) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const [[current]] = await db.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [booking.id]);
      const [[owner]] = await db.query('SELECT vendor_id FROM service_providers WHERE id = ?', [current.provider_id]);
      const [claimed] = await db.query('SELECT id FROM jobs WHERE booking_id = ? LIMIT 1', [booking.id]);
      if (current.vendor_id || claimed.length || current.status === 'cancelled') {
        await db.rollback();
        continue;
      }
      const [visits] = current.schedule === 'recurring'
        ? await db.query(`SELECT o.id, o.status, p.vendor_id FROM booking_occurrences o
            LEFT JOIN service_providers p ON p.id = COALESCE(o.provider_id, ?)
            WHERE o.booking_id = ? ORDER BY o.seq FOR UPDATE`, [current.provider_id, booking.id])
        : [[{ id: 0, status: current.status, vendor_id: owner?.vendor_id }]];
      const targets = current.schedule === 'recurring' && current.status === 'upcoming'
        ? [{ id: 0, status: 'upcoming', vendor_id: owner?.vendor_id }, ...visits]
        : visits;
      for (const visit of targets) {
        if (!visit.vendor_id) continue;
        if (visit.status !== 'upcoming' || current.status !== 'upcoming') {
          if (visit.status === 'completed') report.historicalVisits++;
          continue;
        }
        try {
          if (apply) await assignVendorFinancials(db, current, visit.vendor_id, visit.id);
          else {
            const [saved] = tables.length
              ? await db.query('SELECT id FROM vendor_booking_financials WHERE booking_id = ? AND occurrence_key = ? AND vendor_id = ?',
                [current.id, visit.id, visit.vendor_id])
              : [[]];
            if (!saved.length) await approvedVendorQuote(visit.vendor_id, current.items, db);
          }
          report.saved++;
        } catch (error) {
          if (!(error instanceof VendorPricingError)) throw error;
          report.missingRates.push({ bookingId: booking.id, occurrenceId: visit.id || null, vendorId: visit.vendor_id, reason: error.message });
        }
      }
      if (apply) await db.commit();
      else await db.rollback();
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
