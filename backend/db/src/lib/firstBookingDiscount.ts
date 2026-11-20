import type { Pool, PoolConnection } from 'mysql2/promise';

type Queryable = Pick<Pool, 'query'>;

type Reservation = {
  status: 'reserved' | 'redeemed';
  payment_intent_id: string | null;
};

type PaymentIntentOperations = {
  retrieve: (paymentIntentId: string) => Promise<{ status?: string }>;
  cancel: (paymentIntentId: string) => Promise<{ status?: string }>;
};

const CANCELLABLE_STATUSES = new Set([
  'REQUIRES_PAYMENT_METHOD',
  'REQUIRES_CUSTOMER_ACTION',
  'REQUIRES_CAPTURE',
]);
const TERMINAL_UNPAID_STATUSES = new Set(['CANCELLED', 'FAILED', 'EXPIRED']);

export async function getFirstBookingDiscountReservation(
  db: Queryable,
  userId: number
): Promise<Reservation | null> {
  const [rows]: any = await db.query(
    `SELECT status, payment_intent_id
       FROM first_booking_discount_redemptions
      WHERE user_id = ?
      LIMIT 1`,
    [userId]
  );
  return rows?.[0] || null;
}

/** Reserve the discount for the only payment intent the customer can receive. */
export async function reserveFirstBookingDiscount(
  db: Queryable,
  userId: number,
  paymentIntentId: string
): Promise<boolean> {
  const [result]: any = await db.query(
    `INSERT IGNORE INTO first_booking_discount_redemptions
       (user_id, payment_intent_id, status)
     VALUES (?, ?, 'reserved')`,
    [userId, paymentIntentId]
  );
  if (Number(result?.affectedRows) === 1) return true;

  // Treat a retried reservation for the same intent as idempotent.
  const reservation = await getFirstBookingDiscountReservation(db, userId);
  return reservation?.status === 'reserved'
    && reservation.payment_intent_id === paymentIntentId;
}

/**
 * A new checkout may supersede an abandoned intent only after Airwallex
 * confirms it is terminal and unpaid. Unknown or paid states keep the claim.
 */
export async function releaseAbandonedFirstBookingDiscount(
  db: Queryable,
  userId: number,
  payments: PaymentIntentOperations
): Promise<boolean> {
  const reservation = await getFirstBookingDiscountReservation(db, userId);
  if (!reservation) return true;
  if (reservation.status !== 'reserved' || !reservation.payment_intent_id) return false;

  let status: string;
  try {
    status = String((await payments.retrieve(reservation.payment_intent_id)).status || '').toUpperCase();
  } catch {
    return false;
  }

  if (CANCELLABLE_STATUSES.has(status)) {
    try {
      status = String((await payments.cancel(reservation.payment_intent_id)).status || '').toUpperCase();
    } catch {
      try {
        status = String((await payments.retrieve(reservation.payment_intent_id)).status || '').toUpperCase();
      } catch {
        return false;
      }
    }
  }

  if (!TERMINAL_UNPAID_STATUSES.has(status)) return false;

  await db.query(
    `DELETE FROM first_booking_discount_redemptions
      WHERE user_id = ? AND status = 'reserved'
        AND payment_intent_id = ? AND booking_id IS NULL`,
    [userId, reservation.payment_intent_id]
  );
  return !(await getFirstBookingDiscountReservation(db, userId));
}

/**
 * Claims a COD discount or consumes the matching card-intent reservation.
 * Call inside the booking transaction so booking failure rolls the claim back.
 */
export async function claimFirstBookingDiscount(
  conn: Pick<PoolConnection, 'query'>,
  userId: number,
  paymentIntentId?: string | null
): Promise<boolean> {
  const [result]: any = paymentIntentId
    ? await conn.query(
      `UPDATE first_booking_discount_redemptions
          SET status = 'redeemed', redeemed_at = NOW()
        WHERE user_id = ? AND status = 'reserved'
          AND payment_intent_id = ? AND booking_id IS NULL`,
      [userId, paymentIntentId]
    )
    : await conn.query(
      `INSERT IGNORE INTO first_booking_discount_redemptions (user_id, status)
       VALUES (?, 'redeemed')`,
      [userId]
    );
  return Number(result?.affectedRows) === 1;
}

export async function attachFirstBookingDiscountToBooking(
  conn: Pick<PoolConnection, 'query'>,
  userId: number,
  bookingId: number
): Promise<void> {
  const [result]: any = await conn.query(
    `UPDATE first_booking_discount_redemptions
        SET booking_id = ?
      WHERE user_id = ? AND status = 'redeemed' AND booking_id IS NULL`,
    [bookingId, userId]
  );
  if (Number(result?.affectedRows) !== 1) {
    throw new Error('Failed to link the first-booking discount to its booking.');
  }
}
