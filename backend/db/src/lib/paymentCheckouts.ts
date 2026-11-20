import type { Pool } from 'mysql2/promise';
import pool from './mysql';
import { retrievePaymentIntent } from './airwallex';

type Db = Pick<Pool, 'query'>;

const ORDER_FIELDS = [
  'items', 'addOns', 'schedule', 'scheduledAt', 'cadence', 'recurrence',
  'offer', 'referralCode', 'contact', 'notes',
] as const;
const TERMINAL_UNPAID_STATUSES = new Set(['CANCELLED', 'FAILED', 'EXPIRED']);

export async function saveCheckoutSnapshot(
  userId: number,
  paymentIntentId: string,
  bookingRef: string,
  body: Record<string, any>,
  db: Db = pool
): Promise<void> {
  const order: Record<string, unknown> = {};
  for (const key of ORDER_FIELDS) if (body[key] !== undefined) order[key] = body[key];
  await db.query(
    `INSERT INTO payment_checkouts (payment_intent_id, user_id, booking_ref, order_json)
     VALUES (?, ?, ?, ?)`,
    [paymentIntentId, userId, bookingRef, JSON.stringify(order)]
  );
}

export async function loadCheckoutSnapshot(
  userId: number,
  paymentIntentId: string,
  db: Db = pool
): Promise<{ bookingRef: string; order: Record<string, any> } | null> {
  const [rows]: any = await db.query(
    'SELECT booking_ref, order_json FROM payment_checkouts WHERE payment_intent_id = ? AND user_id = ? LIMIT 1',
    [paymentIntentId, userId]
  );
  const row = rows?.[0];
  if (!row) return null;
  const order = typeof row.order_json === 'string' ? JSON.parse(row.order_json) : row.order_json;
  return { bookingRef: row.booking_ref, order: order || {} };
}

/**
 * Newest recent checkout of this customer whose payment succeeded but which has
 * no booking yet. Checks Airwallex for a few candidates only.
 */
export async function findPaidUnbookedCheckout(
  userId: number,
  db: Db = pool
): Promise<{ intentId: string; bookingId: string; order: Record<string, any> } | null> {
  const [rows]: any = await db.query(
    `SELECT pc.payment_intent_id, pc.booking_ref, pc.order_json
      FROM payment_checkouts pc
      LEFT JOIN bookings b ON b.payment_intent_id = pc.payment_intent_id
      WHERE pc.user_id = ? AND b.id IS NULL
      ORDER BY pc.created_at DESC
      LIMIT 5`,
    [userId]
  );
  for (const row of rows || []) {
    try {
      const intent: any = await retrievePaymentIntent(row.payment_intent_id);
      if (String(intent.status || '').toUpperCase() === 'SUCCEEDED') {
        const order = typeof row.order_json === 'string' ? JSON.parse(row.order_json) : row.order_json;
        return { intentId: row.payment_intent_id, bookingId: row.booking_ref, order: order || {} };
      }
    } catch (error) {
      console.error('[findPaidUnbookedCheckout]', error);
    }
  }
  return null;
}

/**
 * Prune old checkout snapshots only when the payment provider confirms the
 * intent is terminal and unpaid. Paid or unverifiable checkouts stay available
 * for recovery; this routine never cancels an intent.
 */
export async function reconcileStalePaymentCheckouts(
  limit = 100,
  db: Db = pool,
  retrieve: typeof retrievePaymentIntent = retrievePaymentIntent
): Promise<{ examined: number; deleted: number; paidUnbooked: number; unresolved: number }> {
  const batchSize = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
  const [rows]: any = await db.query(
    `SELECT pc.payment_intent_id, pc.user_id
       FROM payment_checkouts pc
       LEFT JOIN bookings b ON b.payment_intent_id = pc.payment_intent_id
      WHERE b.id IS NULL AND pc.created_at <= (NOW() - INTERVAL 3 DAY)
        AND (pc.last_reconciled_at IS NULL
          OR pc.last_reconciled_at <= (NOW() - INTERVAL 1 DAY))
      ORDER BY (pc.last_reconciled_at IS NOT NULL) ASC,
               pc.last_reconciled_at ASC, pc.created_at ASC
      LIMIT ?`,
    [batchSize]
  );

  let deleted = 0;
  let paidUnbooked = 0;
  let unresolved = 0;
  for (const row of rows || []) {
    let status: string;
    try {
      const intent = await retrieve(String(row.payment_intent_id));
      status = String(intent.status || '').toUpperCase();
    } catch (error) {
      console.error('[reconcileStalePaymentCheckouts] intent lookup failed:', error);
      await markCheckoutReconciled(db, row);
      unresolved++;
      continue;
    }

    if (status === 'SUCCEEDED') {
      await markCheckoutReconciled(db, row);
      paidUnbooked++;
      continue;
    }
    if (!TERMINAL_UNPAID_STATUSES.has(status)) {
      await markCheckoutReconciled(db, row);
      unresolved++;
      continue;
    }

    const [result]: any = await db.query(
      `DELETE FROM payment_checkouts
        WHERE payment_intent_id = ? AND user_id = ?
          AND created_at <= (NOW() - INTERVAL 3 DAY)
          AND NOT EXISTS (
            SELECT 1 FROM bookings b WHERE b.payment_intent_id = payment_checkouts.payment_intent_id
          )`,
      [row.payment_intent_id, row.user_id]
    );
    if (Number(result?.affectedRows) === 1) {
      await db.query(
        `DELETE FROM first_booking_discount_redemptions
          WHERE user_id = ? AND payment_intent_id = ?
            AND status = 'reserved' AND booking_id IS NULL`,
        [row.user_id, row.payment_intent_id]
      );
      deleted++;
    }
  }

  return { examined: rows?.length || 0, deleted, paidUnbooked, unresolved };
}

async function markCheckoutReconciled(db: Db, row: { payment_intent_id: string; user_id: number }) {
  await db.query(
    `UPDATE payment_checkouts SET last_reconciled_at = NOW()
      WHERE payment_intent_id = ? AND user_id = ?`,
    [row.payment_intent_id, row.user_id]
  );
}
