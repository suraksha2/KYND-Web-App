import pool from './mysql';
import { sgtDateTime } from './sgt';

const DEFAULT_EXPIRY_MINUTES = 30;
const DEFAULT_FEE_PCT = 15;

function money(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

type FanOutInput = {
  bookingDbId: number;
  catalogIds: number[];
  serviceLabel: string;
  city: string;
  area: string | null;
  windowStart: Date;
  windowEnd: Date | null;
  price: number;
};

/**
 * Broadcasts a freshly placed Kynd booking to every vendor eligible to serve
 * it: active, same city, and already approved to sell one of the booked
 * services — either a live structured listing (`vendor_service_categories`,
 * matched by `catalog_services.subcategory_id`) or a live legacy free-text
 * listing (`vendor_service_prices`, matched by category name).
 *
 * One `offers` row is inserted per eligible vendor, all sharing the same
 * `expires_at` and `booking_id` — first accept wins (the race guard and the
 * sibling `taken` flip both live in `POST /vendor/offers/:id/accept`). This
 * never blocks or replaces the existing marketplace auto-assignment in
 * `POST /api/bookings`; the two run side by side, so a failure here must
 * never fail the booking itself (callers should catch around this call).
 */
export async function fanOutOffersForBooking(input: FanOutInput): Promise<number> {
  const { bookingDbId, catalogIds, serviceLabel, city, area, windowStart, windowEnd, price } = input;
  if (!catalogIds.length || !city?.trim()) return 0;

  const [serviceRows]: any = await pool.query(
    `SELECT s.id, s.subcategory_id, c.name AS category_name
       FROM catalog_services s
       JOIN catalog_categories c ON c.id = s.category_id
      WHERE s.id IN (${catalogIds.map(() => '?').join(',')})`,
    catalogIds
  );
  const rows = serviceRows as any[];
  if (!rows.length) return 0;

  const subcategoryIds = [...new Set(rows.map((r) => r.subcategory_id).filter(Boolean).map(Number))];
  const categoryNames = [...new Set(rows.map((r) => r.category_name).filter(Boolean))] as string[];
  const primaryCategory = rows[0]?.category_name || null;

  const eligibleVendorIds = new Set<number>();

  if (subcategoryIds.length) {
    const [vsc]: any = await pool.query(
      `SELECT DISTINCT vsc.vendor_id
         FROM vendor_service_categories vsc
         JOIN vendors v ON v.id = vsc.vendor_id
        WHERE vsc.status = 'live'
          AND vsc.subcategory_id IN (${subcategoryIds.map(() => '?').join(',')})
          AND v.status = 'active'
          AND LOWER(v.city) = LOWER(?)`,
      [...subcategoryIds, city]
    );
    for (const r of vsc as any[]) eligibleVendorIds.add(Number(r.vendor_id));
  }

  if (categoryNames.length) {
    const [vsp]: any = await pool.query(
      `SELECT DISTINCT vsp.vendor_id
         FROM vendor_service_prices vsp
         JOIN vendors v ON v.id = vsp.vendor_id
        WHERE vsp.status = 'live'
          AND LOWER(vsp.category) IN (${categoryNames.map(() => '?').join(',')})
          AND v.status = 'active'
          AND LOWER(v.city) = LOWER(?)`,
      [...categoryNames.map((n) => n.toLowerCase()), city]
    );
    for (const r of vsp as any[]) eligibleVendorIds.add(Number(r.vendor_id));
  }

  // The marketplace auto-assignment in POST /api/bookings may already have
  // handed this booking to one of a vendor's own team members. Offering it
  // back to that vendor is a self-offer: accepting would convert a job they
  // already hold into a fee-bearing kynd job, and letting it lapse reads as
  // "Kynd offered it to another partner" about their own worker. The visit
  // still shows on their Jobs page via the marketplace merge in
  // GET /vendor/jobs, so the offer is simply never sent.
  const [holderRows]: any = await pool.query(
    `SELECT sp.vendor_id
       FROM bookings b
       JOIN service_providers sp ON sp.id = b.provider_id
      WHERE b.id = ?`,
    [bookingDbId]
  );
  const holderVendorId = (holderRows as any[])[0]?.vendor_id;
  if (holderVendorId) eligibleVendorIds.delete(Number(holderVendorId));

  if (!eligibleVendorIds.size) return 0;

  const expiryMinutes = Math.min(
    Math.max(Number(process.env.OFFER_EXPIRY_MINUTES) || DEFAULT_EXPIRY_MINUTES, 5),
    180
  );
  const expiresAt = sgtDateTime(new Date(Date.now() + expiryMinutes * 60000));
  const startAt = sgtDateTime(windowStart);
  const endAt = windowEnd ? sgtDateTime(windowEnd) : null;

  const vendorIds = [...eligibleVendorIds];
  const placeholders = vendorIds.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`).join(', ');
  const params: any[] = [];
  for (const vendorId of vendorIds) {
    params.push(
      vendorId, bookingDbId, serviceLabel.slice(0, 255), primaryCategory, area,
      startAt, endAt, money(price), DEFAULT_FEE_PCT, expiresAt
    );
  }

  await pool.query(
    `INSERT INTO offers
       (vendor_id, booking_id, service_label, category, area, window_start, window_end, price, fee_pct, status, expires_at)
     VALUES ${placeholders}`,
    params
  );

  return vendorIds.length;
}
