import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { validatePaymentIntent, PaymentVerificationError } = require('../dist/lib/paymentVerification');

const options = {
  userId: 42,
  paymentIntentId: 'pi_test_123',
  merchantOrderId: 'BOOKING-123',
  expectedTotal: 100.25,
};

const intent = (overrides = {}) => ({
  id: options.paymentIntentId,
  status: 'SUCCEEDED',
  merchant_order_id: options.merchantOrderId,
  amount: 100.25,
  currency: 'SGD',
  metadata: { userId: '42', bookingId: options.merchantOrderId },
  ...overrides,
});

test('accepts only a succeeded intent bound to this customer, order, and exact amount', () => {
  assert.doesNotThrow(() => validatePaymentIntent(intent(), options));
  assert.throws(
    () => validatePaymentIntent(intent({ status: 'REQUIRES_CAPTURE' }), options),
    PaymentVerificationError
  );
  assert.throws(
    () => validatePaymentIntent(intent({ metadata: { userId: '43' } }), options),
    { status: 404 }
  );
  assert.throws(
    () => validatePaymentIntent(intent({ merchant_order_id: 'OTHER-ORDER' }), options),
    { status: 409 }
  );
  assert.throws(
    () => validatePaymentIntent(intent({ metadata: { userId: '42', bookingId: 'OTHER-ORDER' } }), options),
    { status: 409 }
  );
  assert.throws(
    () => validatePaymentIntent(intent({ metadata: { userId: '42' } }), options),
    { status: 409 }
  );
  assert.throws(
    () => validatePaymentIntent(intent({ id: 'pi_other' }), options),
    { status: 409 }
  );
  assert.throws(
    () => validatePaymentIntent(intent({ amount: 100.23 }), options),
    PaymentVerificationError
  );
  assert.throws(
    () => validatePaymentIntent(intent({ currency: 'USD' }), options),
    PaymentVerificationError
  );
});
