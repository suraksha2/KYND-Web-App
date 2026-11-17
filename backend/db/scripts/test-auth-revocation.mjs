// Run after `npm run build` with `node --test scripts/test-auth-revocation.mjs`.
// The injected query adapter keeps these role/revocation checks independent of
// production data while exercising the same account lookup used by requests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
process.env.NODE_ENV = 'development';
const { hasValidCsrfOrigin, validateSessionVersion } = require('../dist/http/session');

const sessions = [
  { role: 'user', table: 'users', status: 'active', app: 'storefront' },
  { role: 'admin', table: 'users', status: 'active', app: 'admin' },
  { role: 'super_admin', table: 'users', status: 'active', app: 'superadmin' },
  { role: 'provider', table: 'service_providers', status: 'active', app: 'provider' },
  { role: 'vendor_owner', table: 'vendor_users', status: 'active', app: 'vendor' },
  { role: 'vendor_manager', table: 'vendor_users', status: 'active', app: 'vendor' },
  { role: 'vendor_field', table: 'vendor_users', status: 'active', app: 'provider + vendor' },
];

function fakeDb(row) {
  return {
    query: async (sql) => {
      assert.match(sql, new RegExp(sessions.find((s) => s.role === row.role)?.table || ''));
      return [[row], []];
    },
  };
}

test('active account sessions validate for every role and app', async (t) => {
  for (const item of sessions) {
    await t.test(`${item.role} (${item.app})`, async () => {
      const row = {
        role: item.role,
        session_version: 4,
        status: item.status,
        ...(item.role.startsWith('vendor_') ? { vendor_status: 'active', provider_status: 'active' } : {}),
      };
      const session = {
        id: 17, email: 'test@example.com', role: item.role, exp: 9999999999, sv: 4,
        ...(item.role.startsWith('vendor_') ? { vendorId: 3 } : {}),
      };
      assert.equal(await validateSessionVersion(session, fakeDb(row)), session);
    });
  }
});

test('password change revokes all previously issued role sessions', async (t) => {
  for (const item of sessions) {
    await t.test(item.role, async () => {
      const session = { id: 17, email: 'test@example.com', role: item.role, exp: 9999999999, sv: 4 };
      const db = fakeDb({
        role: item.role, status: 'active', session_version: 5,
        ...(item.role.startsWith('vendor_') ? { vendor_status: 'active', provider_status: 'active' } : {}),
      });
      assert.equal(await validateSessionVersion(session, db), null);
    });
  }
});

test('disabled accounts, suspended vendors, and legacy stateless tokens are rejected', async () => {
  const userSession = { id: 17, email: 'user@example.com', role: 'user', exp: 9999999999, sv: 1 };
  assert.equal(await validateSessionVersion(userSession, fakeDb({
    role: 'user', status: 'inactive', session_version: 1,
  })), null);

  const vendorSession = {
    id: 17, email: 'owner@example.com', role: 'vendor_owner', exp: 9999999999, sv: 1, vendorId: 3,
  };
  assert.equal(await validateSessionVersion(vendorSession, fakeDb({
    role: 'vendor_owner', status: 'active', session_version: 1, vendor_status: 'suspended',
  })), null);

  assert.equal(await validateSessionVersion({ ...userSession, sv: undefined }, fakeDb({
    role: 'user', status: 'active', session_version: 1,
  })), null);
});

test('cookie-authenticated mutations require a trusted Origin', () => {
  const request = (method, origin, cookies = { admin_session: 'signed-cookie' }) => ({
    method,
    headers: origin ? { origin } : {},
    cookies,
  });

  assert.equal(hasValidCsrfOrigin(request('GET')), true);
  assert.equal(hasValidCsrfOrigin(request('POST', 'http://localhost:5173')), true);
  assert.equal(hasValidCsrfOrigin(request('PATCH', 'http://127.0.0.1:5176')), true);
  assert.equal(hasValidCsrfOrigin(request('DELETE', 'https://attacker.example')), false);
  assert.equal(hasValidCsrfOrigin(request('POST')), false);
  assert.equal(hasValidCsrfOrigin(request('POST', undefined, {})), true);
});

test('disabled status revokes every account role independently of password changes', async (t) => {
  for (const item of sessions) {
    await t.test(item.role, async () => {
      const session = {
        id: 17, email: 'test@example.com', role: item.role, exp: 9999999999, sv: 1,
        ...(item.role.startsWith('vendor_') ? { vendorId: 3 } : {}),
      };
      const row = {
        role: item.role,
        status: item.role.startsWith('vendor_') ? 'disabled' : 'inactive',
        session_version: 1,
        ...(item.role.startsWith('vendor_') ? { vendor_status: 'active', provider_status: 'inactive' } : {}),
      };
      assert.equal(await validateSessionVersion(session, fakeDb(row)), null);
    });
  }
});

test('vendor field access is revoked when its linked provider is disabled', async () => {
  const session = {
    id: 17, email: 'field@example.com', role: 'vendor_field', exp: 9999999999, sv: 1, vendorId: 3,
  };
  assert.equal(await validateSessionVersion(session, fakeDb({
    role: 'vendor_field', status: 'active', session_version: 1,
    vendor_status: 'active', provider_status: 'inactive',
  })), null);
});
