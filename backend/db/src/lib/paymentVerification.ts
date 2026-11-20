import pool from './mysql';
import type { Pool } from 'mysql2/promise';
import { paymentCurrency, retrievePaymentIntent, type PaymentIntent } from './airwallex';

const PAID_STATUSES = new Set(['SUCCEEDED']);

export class PaymentVerificationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ExistingCardBooking = {
  id: number;
  booking_id: string;
  user_id: number;
  total: number;
  payment_intent_id: string;
  placed_at: string;
  items: unknown;
  cadence: string | null;
  recurrence: unknown;
  provider_id: number | null;
  provider_name: string | null;
  provider_rating: number | null;
  provider_total_jobs: number | null;
  provider_avatar: string | null;
  provider_working_hours: unknown;
  provider_services: unknown;
};

/** Find only a booking owned by this customer; used to make paid retries idempotent. */
export async function findExistingCardBooking(
  userId: number,
  paymentIntentId: string,
  db: Pick<Pool, 'query'> = pool
): Promise<ExistingCardBooking | null> {
  const [rows]: any = await db.query(
    `SELECT b.id, b.booking_id, b.user_id, b.total, b.payment_intent_id,
            DATE_FORMAT(b.placed_at, '%Y-%m-%d %H:%i:%s') AS placed_at,
            b.items, b.cadence, b.recurrence, b.provider_id,
            sp.name AS provider_name, sp.rating AS provider_rating,
            sp.total_jobs AS provider_total_jobs, sp.avatar AS provider_avatar,
            sp.working_hours AS provider_working_hours, sp.services AS provider_services
       FROM bookings b
       LEFT JOIN service_providers sp ON sp.id = b.provider_id
      WHERE b.user_id = ? AND b.payment_intent_id = ?
      LIMIT 1`,
    [userId, paymentIntentId]
  );
  return rows?.[0] || null;
}

export function paymentIntentBelongsToUser(intent: PaymentIntent, userId: number): boolean {
  const metaUserId = (intent as any)?.metadata?.userId;
  if (typeof metaUserId !== 'string' && typeof metaUserId !== 'number') return false;
  if (metaUserId === '') return false;

  const ownerId = Number(metaUserId);
  return Number.isSafeInteger(ownerId) && ownerId === Number(userId);
}

export function validatePaymentIntent(intent: PaymentIntent, opts: {
  userId: number;
  paymentIntentId: string;
  merchantOrderId: string;
  expectedTotal: number;
}): void {
  if (String(intent.id || '') !== opts.paymentIntentId) {
    throw new PaymentVerificationError('Payment intent does not match this request.', 409);
  }
  if (!paymentIntentBelongsToUser(intent, opts.userId)) {
    throw new PaymentVerificationError('Payment intent not found.', 404);
  }
  if (!PAID_STATUSES.has(String(intent.status || '').toUpperCase())) {
    throw new PaymentVerificationError('Payment has not completed successfully.');
  }

  if (!intent.merchant_order_id || String(intent.merchant_order_id) !== String(opts.merchantOrderId)) {
    throw new PaymentVerificationError('Payment does not match this order.', 409);
  }
  const metadataOrderId = (intent as any)?.metadata?.bookingId;
  if (typeof metadataOrderId !== 'string' || metadataOrderId !== String(opts.merchantOrderId)) {
    throw new PaymentVerificationError('Payment does not match this order.', 409);
  }

  if (String(intent.currency || '').toUpperCase() !== paymentCurrency.toUpperCase()) {
    throw new PaymentVerificationError('Payment currency does not match the order.');
  }

  const paid = Number(intent.amount);
  const expected = Number(opts.expectedTotal);
  if (
    !Number.isFinite(paid) || !Number.isFinite(expected)
    || Math.round(paid * 100) !== Math.round(expected * 100)
  ) {
    throw new PaymentVerificationError('Payment amount does not match the order total.');
  }
}

async function assertMatchingIntent(opts: {
  userId: number;
  paymentIntentId: string;
  merchantOrderId: string;
  expectedTotal: number;
}): Promise<void> {
  const intent = await retrievePaymentIntent(opts.paymentIntentId);
  validatePaymentIntent(intent, opts);
}

/**
 * Ensures a card booking is backed by a succeeded Airwallex intent owned by
 * the customer, matching merchant order ref and server-computed total.
 */
export async function verifyCardPaymentForBooking(opts: {
  userId: number;
  paymentIntentId: string;
  expectedTotal: number;
}): Promise<string> {
  const intentId = opts.paymentIntentId?.trim();
  if (!intentId || !/^[A-Za-z0-9_-]{1,128}$/.test(intentId)) {
    throw new PaymentVerificationError('Payment intent id is required for card bookings.');
  }

  const [used]: any = await pool.query(
    'SELECT id FROM bookings WHERE payment_intent_id = ? LIMIT 1',
    [intentId]
  );
  if (used?.length) {
    throw new PaymentVerificationError('This payment has already been used for a booking.', 409);
  }

  const intent = await retrievePaymentIntent(intentId);
  const merchantOrderId = typeof intent.merchant_order_id === 'string'
    ? intent.merchant_order_id
    : '';
  if (!merchantOrderId || merchantOrderId.length > 50) {
    throw new PaymentVerificationError('Payment does not match this order.', 409);
  }
  validatePaymentIntent(intent, {
    ...opts,
    paymentIntentId: intentId,
    merchantOrderId,
  });
  return merchantOrderId;
}

/** Revalidate a persisted card booking before a recovery job repairs its visits. */
export async function verifyStoredCardPayment(opts: {
  userId: number;
  paymentIntentId: string;
  merchantOrderId: string;
  expectedTotal: number;
}): Promise<void> {
  if (!opts.paymentIntentId || !opts.userId) {
    throw new PaymentVerificationError('Stored card booking is missing its payment owner or intent.');
  }
  await assertMatchingIntent(opts);
}
