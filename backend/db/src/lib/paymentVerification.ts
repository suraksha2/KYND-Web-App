import pool from './mysql';
import { paymentCurrency, retrievePaymentIntent, type PaymentIntent } from './airwallex';

const PAID_STATUSES = new Set(['SUCCEEDED']);

export class PaymentVerificationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
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
  if (!PAID_STATUSES.has(String(intent.status || '').toUpperCase())) {
    throw new PaymentVerificationError('Payment has not completed successfully.');
  }

  const meta = (intent as any).metadata || {};
  if (
    meta.userId == null
    || !Number.isFinite(Number(meta.userId))
    || Number(meta.userId) !== Number(opts.userId)
  ) {
    throw new PaymentVerificationError('Payment does not belong to this account.', 403);
  }

  if (!intent.merchant_order_id || String(intent.merchant_order_id) !== String(opts.merchantOrderId)) {
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
  merchantOrderId: string;
  expectedTotal: number;
}): Promise<void> {
  const intentId = opts.paymentIntentId?.trim();
  if (!intentId || intentId.length > 128) {
    throw new PaymentVerificationError('Payment intent id is required for card bookings.');
  }

  const [used]: any = await pool.query(
    'SELECT id FROM bookings WHERE payment_intent_id = ? LIMIT 1',
    [intentId]
  );
  if (used?.length) {
    throw new PaymentVerificationError('This payment has already been used for a booking.', 409);
  }

  await assertMatchingIntent({ ...opts, paymentIntentId: intentId });
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
