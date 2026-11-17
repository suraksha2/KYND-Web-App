import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

process.env.SESSION_SECRET = 'launch-blocker-test-secret';
const require = createRequire(import.meta.url);
const { createSessionToken } = require('../dist/lib/auth');
const {
  apiAuthGate,
  requireCustomerSession,
  requireCustomerOrAdminSession,
} = require('../dist/http/session');
const { priceOrder, PricingError } = require('../dist/lib/pricing');
const { computePartnerCostFromRule } = require('../dist/lib/pricingRules');
const { isReviewableBooking } = require('../dist/routes/reviews');
const { providerBookingView } = require('../dist/routes/provider');

async function callMiddleware(middleware, role, path = '/bookings', method = 'GET', session = null) {
  const token = await createSessionToken({ id: 42, email: 'test@example.com', role });
  const req = {
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
    method,
    path,
    ...(session ? { session } : {}),
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalls = 0;
  await middleware(req, res, () => { nextCalls += 1; });
  return { req, res, nextCalls };
}

function pricingDb({
  service = {
    id: 1,
    name: 'Test service',
    duration: '2 hours',
    default_partner_cost: null,
    markup_pct_override: 0,
    status: 'live',
  },
  rule = { service_id: 1, strategy: 'flat', params: { amount: 100 } },
  previousBookings = [],
  referrerId = 2,
} = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized.includes('FROM catalog_services')) return [[service], []];
      if (normalized.includes('FROM service_pricing_rules')) return [[rule], []];
      if (normalized.includes('FROM bookings')) {
        assert.match(normalized, /WHERE user_id = \? LIMIT 1/);
        assert.doesNotMatch(normalized, /status/i);
        return [previousBookings, []];
      }
      if (normalized.includes('FROM users') && normalized.includes('referral_code')) {
        const [code, userId] = params;
        return [code === 'KYND-OTHER' && referrerId !== userId ? [{ id: referrerId }] : [], []];
      }
      throw new Error(`Unexpected pricing query: ${normalized}`);
    },
  };
}

const baseInput = (overrides = {}) => ({
  items: [{ catalogId: 1, duration: '15 minutes' }],
  userId: 1,
  ...overrides,
});

test('provider sessions cannot pass customer booking or private customer auth guards', async () => {
  const publicAuthPath = await callMiddleware(apiAuthGate, 'provider', '/auth/update-profile', 'PUT');
  assert.equal(publicAuthPath.nextCalls, 1, 'auth routes remain public at the outer gate');
  const providerSession = { id: 42, email: 'test@example.com', role: 'provider' };
  const customerSession = { id: 42, email: 'test@example.com', role: 'user' };
  const privateAuthHandler = await callMiddleware(
    requireCustomerSession, 'provider', '/update-profile', 'PUT', providerSession
  );
  assert.equal(privateAuthHandler.res.statusCode, 403);
  assert.equal(privateAuthHandler.nextCalls, 0);

  const providerBookingEdit = await callMiddleware(
    requireCustomerOrAdminSession, 'provider', '/bookings/7', 'PATCH', providerSession
  );
  assert.equal(providerBookingEdit.res.statusCode, 403);
  assert.equal(providerBookingEdit.nextCalls, 0);

  const customer = await callMiddleware(requireCustomerSession, 'user', '/bookings', 'GET', customerSession);
  assert.equal(customer.nextCalls, 1);
  const customerQuote = await callMiddleware(
    requireCustomerOrAdminSession, 'user', '/payments/quote', 'POST', customerSession
  );
  assert.equal(customerQuote.nextCalls, 1);
});

test('reviews require a completed booking or completed recurring visit', () => {
  assert.equal(isReviewableBooking('upcoming', 'scheduled', false), false);
  assert.equal(isReviewableBooking('cancelled', 'scheduled', false), false);
  assert.equal(isReviewableBooking('completed', 'scheduled', false), true);
  assert.equal(isReviewableBooking('completed', 'recurring', false), false);
  assert.equal(isReviewableBooking('upcoming', 'recurring', false), false);
  assert.equal(isReviewableBooking('cancelled', 'recurring', true), true);
});

test('replaced recurring providers lose customer details and conversation access', () => {
  const oldProviderView = providerBookingView({
    schedule: 'recurring',
    provider_id: 7,
    status: 'upcoming',
    contact_name: 'Customer',
    contact_phone: '+6500000000',
    contact_address: 'Private address',
    contact_city: 'Singapore',
    contact_pincode: '123456',
    contact_area: 'Central',
    notes: 'Gate code',
    occurrences: [
      { provider_id: 7, status: 'completed' },
      { provider_id: 8, status: 'upcoming' },
    ],
  }, 7);
  assert.equal(oldProviderView.contact_name, null);
  assert.equal(oldProviderView.contact_phone, null);
  assert.equal(oldProviderView.contact_address, null);
  assert.equal(oldProviderView.notes, null);
  assert.equal(oldProviderView.canMessage, false);
  assert.deepEqual(oldProviderView.occurrences.map(o => o.provider_id), [7]);

  const activeProviderView = providerBookingView({
    schedule: 'recurring',
    provider_id: 7,
    contact_name: 'Customer',
    occurrences: [{ provider_id: 7, status: 'upcoming' }],
  }, 7);
  assert.equal(activeProviderView.contact_name, 'Customer');
  assert.equal(activeProviderView.canMessage, true);
});

test('hourly price uses catalogue duration, not a client-supplied duration', async () => {
  const db = pricingDb({
    rule: { service_id: 1, strategy: 'hourly', params: { rate: 100 } },
  });
  const priced = await priceOrder(baseInput(), db);
  assert.equal(priced.total, 200);
  assert.equal(priced.items[0].duration, '2 hours');
});

test('per-unit pricing multiplies by quantity once', async () => {
  const db = pricingDb({
    rule: { service_id: 1, strategy: 'per_unit', params: { rate: 25 } },
  });
  const priced = await priceOrder({
    ...baseInput(),
    items: [{ catalogId: 1, qty: 3 }],
  }, db);
  assert.equal(priced.items[0].priceFrom, 25);
  assert.equal(priced.total, 75);
});

test('an hourly rate outside all configured windows cannot silently price at zero', async () => {
  assert.equal(
    computePartnerCostFromRule(
      { strategy: 'hourly', params: { rate_schedule: [{ start: '10:00', end: '12:00', rate: 80 }] } },
      { durationHours: 2, partySize: 1, startTime: '09:00' }
    ),
    null
  );

  const db = pricingDb({
    rule: {
      service_id: 1,
      strategy: 'hourly',
      params: { rate_schedule: [{ start: '10:00', end: '12:00', rate: 80 }] },
    },
  });
  await assert.rejects(
    priceOrder(baseInput({ scheduledAt: '2030-01-01T09:00:00+08:00' }), db),
    PricingError
  );

  const fallbackDb = pricingDb({
    service: {
      id: 1, name: 'Test service', duration: '2 hours',
      default_partner_cost: 40, markup_pct_override: 0, status: 'live',
    },
    rule: {
      service_id: 1,
      strategy: 'hourly',
      params: { rate_schedule: [{ start: '10:00', end: '12:00', rate: 80 }] },
    },
  });
  const fallbackPrice = await priceOrder(
    baseInput({ scheduledAt: '2030-01-01T09:00:00+08:00' }),
    fallbackDb
  );
  assert.equal(fallbackPrice.total, 40, 'only a positive configured fallback may price the service');
});

test('referral discounts require another customer valid referral code', async () => {
  const withoutCode = pricingDb();
  await assert.rejects(
    priceOrder(baseInput({ offer: { id: 'refer' } }), withoutCode),
    /valid referral code/i
  );

  const withCode = pricingDb();
  const priced = await priceOrder(
    baseInput({ offer: { id: 'refer' }, referralCode: 'kynd-other' }),
    withCode
  );
  assert.equal(priced.discount, 15);
  assert.equal(priced.total, 85);
  assert.equal(priced.referralCode, 'KYND-OTHER');

  const selfReferral = pricingDb({ referrerId: 1 });
  await assert.rejects(
    priceOrder(baseInput({ referralCode: 'KYND-OTHER' }), selfReferral),
    /invalid referral code/i
  );
});

test('cancelled bookings still consume first-booking eligibility', async () => {
  const db = pricingDb({
    previousBookings: [{ id: 7, status: 'cancelled' }],
  });
  const priced = await priceOrder(baseInput({ offer: { id: 'first' } }), db);
  assert.equal(priced.offerId, null);
  assert.equal(priced.discount, 0);

  const newCustomer = pricingDb();
  const firstBooking = await priceOrder(baseInput({ offer: { id: 'first' } }), newCustomer);
  assert.equal(firstBooking.offerId, 'first');
  assert.equal(firstBooking.discount, 10);
});
