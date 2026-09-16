import pool from './mysql';
import { retrievePaymentIntent } from './airwallex';

const PAID_STATUSES = new Set(['SUCCEEDED', 'REQUIRES_CAPTURE']);

export class PaymentVerificationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
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

  const intent = await retrievePaymentIntent(intentId);
  if (!PAID_STATUSES.has(String(intent.status))) {
    throw new PaymentVerificationError('Payment has not completed successfully.');
  }

  const meta = (intent as any).metadata || {};
  if (meta.userId != null && Number(meta.userId) !== Number(opts.userId)) {
    throw new PaymentVerificationError('Payment does not belong to this account.', 403);
  }

  if (
    intent.merchant_order_id &&
    String(intent.merchant_order_id) !== String(opts.merchantOrderId)
  ) {
    throw new PaymentVerificationError('Payment does not match this order.');
  }

  const paid = Number(intent.amount);
  const expected = Number(opts.expectedTotal);
  if (!Number.isFinite(paid) || Math.abs(paid - expected) > 0.02) {
    throw new PaymentVerificationError('Payment amount does not match the order total.');
  }
}
