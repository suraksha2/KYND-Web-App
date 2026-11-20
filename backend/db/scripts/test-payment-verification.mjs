import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  findExistingCardBooking,
  validatePaymentIntent,
  PaymentVerificationError,
} = require('../dist/lib/paymentVerification');
const { reconcileStalePaymentCheckouts } = require('../dist/lib/paymentCheckouts');

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

test('payment retry lookup is scoped to both the customer and payment intent', async () => {
  const row = {
    id: 12,
    booking_id: options.merchantOrderId,
    user_id: options.userId,
    total: options.expectedTotal,
    payment_intent_id: options.paymentIntentId,
  };
  let query;
  const db = {
    async query(sql, params) {
      query = { sql, params };
      return [[row], []];
    },
  };

  assert.deepEqual(
    await findExistingCardBooking(options.userId, options.paymentIntentId, db),
    row
  );
  assert.deepEqual(query.params, [options.userId, options.paymentIntentId]);
  assert.match(query.sql, /WHERE b\.user_id = \? AND b\.payment_intent_id = \?/);

  const noMatch = await findExistingCardBooking(options.userId, options.paymentIntentId, {
    async query() { return [[], []]; },
  });
  assert.equal(noMatch, null);
});

test('booking creation replays an existing paid booking instead of duplicating or rejecting it', () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const source = readFileSync(
    path.join(projectRoot, 'backend/db/src/routes/bookings.ts'),
    'utf8'
  );
  const route = source.slice(source.indexOf("router.post('/', requireCustomerSession"));
  assert.ok(route.indexOf('existingCardBookingResponse(') < route.indexOf('await priceOrder('));
  assert.equal(
    (route.match(/if \(existing\) return res\.status\(200\)\.json\(existing\)/g) || []).length,
    2
  );
  const occurrenceWrite = route.indexOf('await createOccurrences(');
  const snapshotCleanup = route.indexOf('DELETE FROM payment_checkouts');
  const transactionCommit = route.indexOf('await conn.commit()');
  assert.ok(occurrenceWrite < snapshotCleanup && snapshotCleanup < transactionCommit);
});

test('checkout reconciliation prunes only confirmed terminal-unpaid snapshots', async () => {
  const rows = [
    { payment_intent_id: 'pi_failed', user_id: 42 },
    { payment_intent_id: 'pi_paid', user_id: 42 },
    { payment_intent_id: 'pi_active', user_id: 42 },
    { payment_intent_id: 'pi_unknown', user_id: 42 },
  ];
  const statements = [];
  const db = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.includes('SELECT pc.payment_intent_id')) return [rows, []];
      if (sql.includes('DELETE FROM payment_checkouts')) return [{ affectedRows: 1 }, []];
      if (sql.includes('DELETE FROM first_booking_discount_redemptions')) return [{ affectedRows: 1 }, []];
      if (sql.includes('UPDATE payment_checkouts SET last_reconciled_at')) return [{ affectedRows: 1 }, []];
      throw new Error(`Unexpected reconciliation query: ${sql}`);
    },
  };
  const statuses = new Map([
    ['pi_failed', 'FAILED'],
    ['pi_paid', 'SUCCEEDED'],
    ['pi_active', 'REQUIRES_PAYMENT_METHOD'],
  ]);
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await reconcileStalePaymentCheckouts(25, db, async (id) => {
      if (id === 'pi_unknown') throw new Error('Provider unavailable');
      return { status: statuses.get(id) };
    });

    assert.deepEqual(result, { examined: 4, deleted: 1, paidUnbooked: 1, unresolved: 2 });
    assert.equal(statements.filter(({ sql }) => sql.includes('DELETE FROM payment_checkouts')).length, 1);
    assert.equal(statements.filter(({ sql }) => sql.includes('DELETE FROM first_booking_discount_redemptions')).length, 1);
    assert.equal(statements.filter(({ sql }) => sql.includes('UPDATE payment_checkouts SET last_reconciled_at')).length, 3);
    assert.match(statements[0].sql, /last_reconciled_at/);
  } finally {
    console.error = originalError;
  }
});
