// Run after npm run build with:
// node --test scripts/test-session-cookie-selection.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  CUSTOMER_SESSION_COOKIE_NAME,
  PROVIDER_SESSION_COOKIE_NAME,
  getSessionToken,
} = require('../dist/http/session');

const request = (originalUrl, role, cookies) => {
  const headers = role ? { 'x-helpr-expected-role': role } : {};
  return {
    originalUrl,
    path: originalUrl,
    headers,
    cookies,
    get(name) {
      return headers[name.toLowerCase()];
    },
  };
};

test('customer and provider cookies remain isolated when both exist', () => {
  const cookies = {
    admin_session: 'legacy-admin',
    [CUSTOMER_SESSION_COOKIE_NAME]: 'customer-session',
    [PROVIDER_SESSION_COOKIE_NAME]: 'provider-session',
  };

  assert.equal(getSessionToken(request('/api/messages', 'user', cookies)), 'customer-session');
  assert.equal(getSessionToken(request('/api/messages', 'provider', cookies)), 'provider-session');
  assert.equal(getSessionToken(request('/api/bookings', null, cookies)), 'customer-session');
  assert.equal(getSessionToken(request('/api/provider/bookings', null, cookies)), 'provider-session');
  assert.equal(getSessionToken(request('/api/orders', null, cookies)), 'legacy-admin');
});

test('role-scoped routes fall back to a legacy session during rollout', () => {
  const cookies = { admin_session: 'legacy-session' };

  assert.equal(getSessionToken(request('/api/bookings', null, cookies)), 'legacy-session');
  assert.equal(getSessionToken(request('/api/provider/bookings', null, cookies)), 'legacy-session');
});

test("a role never falls back to the other role's scoped cookie", () => {
  assert.equal(
    getSessionToken(request('/api/messages', 'user', {
      [PROVIDER_SESSION_COOKIE_NAME]: 'provider-session',
    })),
    undefined
  );
  assert.equal(
    getSessionToken(request('/api/messages', 'provider', {
      [CUSTOMER_SESSION_COOKIE_NAME]: 'customer-session',
    })),
    undefined
  );
});
