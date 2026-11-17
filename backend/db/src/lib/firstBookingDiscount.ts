import type { PoolConnection } from 'mysql2/promise';

/**
 * Claims the customer's one-time first-booking discount inside the booking
 * transaction. The primary key serializes concurrent checkouts for a user.
 */
export async function claimFirstBookingDiscount(
  conn: Pick<PoolConnection, 'query'>,
  userId: number
): Promise<boolean> {
  const [result]: any = await conn.query(
    `INSERT IGNORE INTO first_booking_discount_redemptions (user_id)
     VALUES (?)`,
    [userId]
  );
  return Number(result?.affectedRows) === 1;
}
