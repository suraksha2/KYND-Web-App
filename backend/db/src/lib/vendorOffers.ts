import type { PoolConnection } from 'mysql2/promise';

export type LockedVendorOffer =
  | { state: 'open'; offer: any }
  | { state: 'accepted'; jobId: number }
  | { state: 'unavailable' }
  | { state: 'not_found' };

/**
 * Lock the booking before the offer row so sibling offers serialize on one
 * parent row. The caller owns the transaction and must commit or roll it back.
 */
export async function lockVendorOffer(
  conn: PoolConnection,
  vendorId: number,
  offerId: number | string
): Promise<LockedVendorOffer> {
  const [initialRows]: any = await conn.query('SELECT * FROM offers WHERE id = ?', [offerId]);
  const initialOffer = (initialRows as any[])[0];
  if (!initialOffer || Number(initialOffer.vendor_id) !== Number(vendorId)) {
    return { state: 'not_found' };
  }

  if (initialOffer.booking_id) {
    await conn.query('SELECT id FROM bookings WHERE id = ? FOR UPDATE', [initialOffer.booking_id]);
  }
  const [lockedRows]: any = await conn.query(
    'SELECT * FROM offers WHERE id = ? FOR UPDATE',
    [offerId]
  );
  const offer = (lockedRows as any[])[0];
  if (!offer || Number(offer.vendor_id) !== Number(vendorId)) {
    return { state: 'not_found' };
  }

  if (offer.status === 'accepted') {
    const [jobRows]: any = await conn.query(
      'SELECT id FROM jobs WHERE offer_id = ? LIMIT 1',
      [offer.id]
    );
    const existingJob = (jobRows as any[])[0];
    return existingJob
      ? { state: 'accepted', jobId: Number(existingJob.id) }
      : { state: 'unavailable' };
  }
  return offer.status === 'open'
    ? { state: 'open', offer }
    : { state: 'unavailable' };
}

/** Claim a locked open offer and close its still-open sibling offers. */
export async function claimLockedVendorOffer(
  conn: PoolConnection,
  offer: any
): Promise<boolean> {
  const [updated]: any = await conn.query(
    `UPDATE offers SET status = 'accepted', accepted_at = NOW()
      WHERE id = ? AND status = 'open' AND expires_at > NOW()`,
    [offer.id]
  );
  if (updated.affectedRows === 0) return false;

  if (offer.booking_id) {
    await conn.query(
      `UPDATE offers SET status = 'taken'
        WHERE booking_id = ? AND id != ? AND status = 'open'`,
      [offer.booking_id, offer.id]
    );
  }
  return true;
}
