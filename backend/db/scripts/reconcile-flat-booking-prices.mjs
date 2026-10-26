// npm run build && node scripts/reconcile-flat-booking-prices.mjs [--apply]
// Read-only by default. --apply corrects only unpaid upcoming cash bookings whose
// saved flat-rule price exactly matches the old cost-plus-markup calculation.
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
const require = createRequire(import.meta.url);
const pool = require('../dist/lib/mysql').default;
const { sgtDateTime } = require('../dist/lib/sgt');
const apply = process.argv.includes('--apply');
const RECURRING_DISCOUNT = 0.85;
const DEFAULT_MARKUP_PCT = 30;

function money(n) {
  return Math.round(n * 100) / 100;
}

function markupPct(override) {
  const pct = override === null || override === undefined ? DEFAULT_MARKUP_PCT : Number(override);
  return Number.isFinite(pct) ? pct / 100 : DEFAULT_MARKUP_PCT / 100;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

try {
  const [serviceRows] = await pool.query(`
    SELECT s.id, s.name, s.markup_pct_override, r.strategy, r.params
      FROM catalog_services s
      LEFT JOIN service_pricing_rules r
        ON r.id = (SELECT MIN(id) FROM service_pricing_rules WHERE service_id = s.id)`);
  const services = new Map((serviceRows || []).map((s) => [
    Number(s.id),
    { ...s, params: parseJson(s.params, {}) },
  ]));
  const [financeTables] = await pool.query("SHOW TABLES LIKE 'vendor_booking_financials'");
  const hasFinanceTable = financeTables.length > 0;
  const [bookings] = await pool.query(`
    SELECT id, booking_id, items, total, schedule, status, payment, payment_intent_id, history
      FROM bookings
     ORDER BY id`);

  const report = { mode: apply ? 'apply' : 'read-only', corrected: [], needsReview: [], alreadyCorrect: 0 };
  const correctedAt = sgtDateTime(new Date());

  for (const booking of bookings) {
    const items = parseJson(booking.items, []);
    if (!Array.isArray(items) || !items.length) continue;

    let oldServiceBase = 0;
    let newServiceBase = 0;
    let changed = false;
    const review = [];
    const correctedItems = items.map((raw) => {
      const item = { ...raw };
      const qty = Math.max(1, Math.min(20, Number(item.qty) || 1));
      const stored = Number(item.priceFrom);
      const service = services.get(Number(item.catalogId));
      let corrected = stored;

      if (!Number.isFinite(stored)) {
        review.push(`${item.name || item.catalogId}: invalid saved price`);
        return item;
      }
      if (service?.strategy === 'flat') {
        const customerPrice = money(Number(service.params?.amount));
        const buggyPrice = Math.round(customerPrice * (1 + markupPct(service.markup_pct_override)));
        if (Number.isFinite(customerPrice) && customerPrice > 0 && stored === buggyPrice && stored !== customerPrice) {
          corrected = customerPrice;
          item.priceFrom = corrected;
          changed = true;
        } else if (stored !== customerPrice) {
          review.push(`${item.name || item.catalogId}: saved ${stored}, catalog ${customerPrice}`);
        }
      }

      oldServiceBase += stored * qty;
      newServiceBase += corrected * qty;
      return item;
    });

    if (!changed) {
      if (!review.length) report.alreadyCorrect++;
      else report.needsReview.push({ bookingId: booking.booking_id, reason: review.join('; ') });
      continue;
    }

    const oldServiceTotal = booking.schedule === 'recurring'
      ? Math.round(oldServiceBase * RECURRING_DISCOUNT)
      : money(oldServiceBase);
    const newServiceTotal = booking.schedule === 'recurring'
      ? Math.round(newServiceBase * RECURRING_DISCOUNT)
      : money(newServiceBase);
    // Preserve any additive amount the order already contained (add-ons minus a
    // fixed offer/promo discount). Do not reinterpret it as part of the service.
    const nonServiceAdjustment = money(Number(booking.total) - oldServiceTotal);
    const correctedTotal = money(Math.max(0, newServiceTotal + nonServiceAdjustment));
    const entry = {
      bookingId: booking.booking_id,
      status: booking.status,
      payment: booking.payment,
      from: Number(booking.total),
      to: correctedTotal,
    };
    if (review.length) {
      report.needsReview.push({ ...entry, reason: review.join('; ') });
      continue;
    }

    const openUnpaidCash = booking.status === 'upcoming'
      && booking.payment === 'cod'
      && !booking.payment_intent_id;
    if (!openUnpaidCash) {
      report.needsReview.push({ ...entry, reason: 'closed or already associated with a payment' });
      continue;
    }

    if (apply) {
      const history = parseJson(booking.history, []);
      const nextHistory = Array.isArray(history) ? history : [];
      if (!nextHistory.some((h) => h?.type === 'price_corrected')) {
        nextHistory.push({
          at: correctedAt,
          type: 'price_corrected',
          note: 'Customer price corrected to the approved catalog amount.',
        });
      }
      await pool.query(
        'UPDATE bookings SET items = ?, total = ?, history = ? WHERE id = ?',
        [JSON.stringify(correctedItems), correctedTotal, JSON.stringify(nextHistory), booking.id]
      );
      if (hasFinanceTable) {
        await pool.query(
          `UPDATE vendor_booking_financials
              SET customer_total = ?
            WHERE booking_id = ? AND completed_at IS NULL AND payout_id IS NULL`,
          [correctedTotal, booking.id]
        );
      }
    }
    report.corrected.push(entry);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
