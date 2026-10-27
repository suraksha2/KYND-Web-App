import pool from './mysql';
import type { PoolConnection } from 'mysql2/promise';

type Database = typeof pool | PoolConnection;

export class VendorPricingError extends Error {
  status = 409;
}

export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function vendorAmounts(vendorPrice: number) {
  if (!Number.isFinite(vendorPrice) || vendorPrice < 0 || vendorPrice > 99999999.99) {
    throw new VendorPricingError('Invalid vendor rate.');
  }
  // Vendor price is their earnings directly - no platform fee deduction
  const net = money(vendorPrice);
  return { gross: net, feePct: 0, fee: 0, net };
}

export function bookingItems(raw: any): any[] {
  try {
    const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

// Each vendor item is a rate for that exact catalog variant, multiplied by
// quantity. Customer discounts/markups do not change the approved vendor rate.
// Add-ons use their separately configured Superadmin partner cost.
export async function approvedVendorQuote(vendorId: number, rawItems: any, db: Database = pool, lock = false) {
  const items = bookingItems(rawItems);
  if (!items.length) throw new VendorPricingError('This booking has no services to price.');
  const lines: any[] = [];
  for (const item of items) {
    const qty = Number(item.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 50) throw new VendorPricingError('Invalid service quantity.');
    let rows: any;
    if (item.addonId) {
      [rows] = await db.query(
        `SELECT id, name, partner_cost AS price FROM addons WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`,
        [item.addonId]
      );
    } else if (item.addonServiceId) {
      [rows] = await db.query(
        `SELECT id AS catalog_service_id, name, default_partner_cost AS price
           FROM catalog_services WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`,
        [item.addonServiceId]
      );
    } else {
      const serviceId = Number(item.catalogId);
      [rows] = await db.query(
        `SELECT i.id, i.catalog_service_id, i.price, s.name, c.id AS approval_id, c.reviewed_at
           FROM vendor_service_category_items i
           JOIN vendor_service_categories c ON c.id = i.vendor_category_id
           JOIN catalog_services s ON s.id = i.catalog_service_id
          WHERE c.vendor_id = ? AND c.status = 'live'
            AND ${serviceId > 0 ? 's.id = ?' : 's.name = ?'}
          ${lock ? 'FOR UPDATE' : ''}`,
        [vendorId, serviceId > 0 ? serviceId : item.name || item.serviceName || '']
      );
    }
    if (rows.length !== 1 || rows[0].price == null || !Number.isFinite(Number(rows[0].price)) ||
        Number(rows[0].price) < 0 || (!item.addonId && !item.addonServiceId && Number(rows[0].price) === 0)) {
      throw new VendorPricingError(`No approved vendor rate for ${item.name || item.serviceName || 'this service'}.`);
    }
    const row = rows[0];
    lines.push({
      catalogId: row.catalog_service_id ?? null, addonId: item.addonId ?? null,
      addonServiceId: item.addonServiceId ?? null,
      approvalId: row.approval_id ?? null, approvedAt: row.reviewed_at ?? null,
      name: row.name, qty, unitRate: Number(row.price), amount: money(Number(row.price) * qty),
    });
  }
  return { ...vendorAmounts(money(lines.reduce((sum, line) => sum + line.amount, 0))), lines };
}

// Call under the booking/roster transaction. Same-vendor cover retains the
// agreed rate; cross-vendor cover captures the replacement's approved rates.
export async function assignVendorFinancials(
  db: Database, booking: any, vendorId: number | null, occurrenceKey = 0
) {
  const [existing]: any = await db.query(
    'SELECT * FROM vendor_booking_financials WHERE booking_id = ? AND occurrence_key = ? FOR UPDATE',
    [booking.id, occurrenceKey]
  );
  const current = existing[0];
  if (current?.payout_id || current?.completed_at) {
    throw new VendorPricingError('Completed or settled vendor earnings cannot be reassigned.');
  }
  if (vendorId && Number(current?.vendor_id) === Number(vendorId)) return current;
  if (!vendorId) {
    await db.query('DELETE FROM vendor_booking_financials WHERE booking_id = ? AND occurrence_key = ?',
      [booking.id, occurrenceKey]);
    return null;
  }
  const quote = await approvedVendorQuote(vendorId, booking.items, db, true);
  await db.query(
    `INSERT INTO vendor_booking_financials
       (booking_id, occurrence_key, vendor_id, customer_total, gross, fee_pct, fee, net, rate_items)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE vendor_id = VALUES(vendor_id), customer_total = VALUES(customer_total),
       gross = VALUES(gross), fee_pct = VALUES(fee_pct), fee = VALUES(fee), net = VALUES(net),
       rate_items = VALUES(rate_items)`,
    [booking.id, occurrenceKey, vendorId, booking.total, quote.gross, 0, 0, quote.net, JSON.stringify(quote.lines)]
  );
  return quote;
}

// Newly materialized recurring visits inherit the saved series rate, never
// today's catalog rate. INSERT IGNORE preserves exceptions and paid visits.
export async function inheritVisitFinancials(db: Database, bookingId: number) {
  await db.query(
    `INSERT IGNORE INTO vendor_booking_financials
       (booking_id, occurrence_key, vendor_id, customer_total, gross, fee_pct, fee, net, rate_items)
     SELECT f.booking_id, o.id, f.vendor_id, f.customer_total, f.gross, 0, 0, f.net, f.rate_items
       FROM vendor_booking_financials f
       JOIN booking_occurrences o ON o.booking_id = f.booking_id
       JOIN service_providers sp ON sp.id = o.provider_id AND sp.vendor_id = f.vendor_id
      WHERE f.booking_id = ? AND f.occurrence_key = 0 AND o.status = 'upcoming'`,
    [bookingId]
  );
}

export async function recordVendorCompletion(db: Database, bookingId: number, occurrenceKey: number, completed: boolean) {
  const [rows]: any = await db.query(
    'SELECT payout_id FROM vendor_booking_financials WHERE booking_id = ? AND occurrence_key = ? FOR UPDATE',
    [bookingId, occurrenceKey]
  );
  if (!completed && rows[0]?.payout_id) throw new VendorPricingError('This visit is already included in a payout.');
  await db.query(
    `UPDATE vendor_booking_financials SET completed_at = ${completed ? 'COALESCE(completed_at, NOW())' : 'NULL'}
      WHERE booking_id = ? AND occurrence_key = ?`,
    [bookingId, occurrenceKey]
  );
}

// Snapshot rows for actual visits only, excluding cancelled work and bookings
// already represented by a legacy job. Template rows never earn money.
export const VENDOR_VISIT_FINANCE_SQL = `
  SELECT f.*, COALESCE(o.scheduled_at, b.scheduled_at, b.placed_at) AS window_start,
         b.contact_name AS customer_name, b.contact_area AS customer_area,
         COALESCE(o.status, b.status) AS visit_status, b.items
    FROM vendor_booking_financials f
    JOIN bookings b ON b.id = f.booking_id
    LEFT JOIN booking_occurrences o ON o.id = f.occurrence_key AND o.booking_id = b.id
   WHERE ((f.occurrence_key = 0 AND b.schedule <> 'recurring') OR o.id IS NOT NULL)
     AND COALESCE(o.status, b.status) <> 'cancelled'
     AND (b.status <> 'cancelled' OR o.status = 'completed')
     AND b.vendor_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.booking_id = b.id)`;

export const PAYOUT_WORK_SQL = `
  SELECT CONCAT('job-', id) AS work_id, id, vendor_id, payout_id, gross, 0 AS fee_pct, net,
         COALESCE(completed_at, paid_at) AS completed_at, paid_at, status, source,
         service_label, customer_name, customer_area, window_start
    FROM jobs WHERE source = 'kynd' AND status IN ('completed', 'paid')
  UNION ALL
  SELECT CONCAT('mkt-', booking_id, '-', occurrence_key), id, vendor_id, payout_id, gross, 0 AS fee_pct, net,
         completed_at, NULL, 'completed', 'kynd',
         CONCAT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rate_items, '$[0].name')), CONCAT('Booking #', booking_id)),
                IF(occurrence_key = 0, '', CONCAT(' / visit ', occurrence_key))),
         customer_name, customer_area, window_start
    FROM (${VENDOR_VISIT_FINANCE_SQL}) visits
   WHERE completed_at IS NOT NULL AND visit_status = 'completed'`;
