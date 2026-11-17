// Run after `npm run build` with `node --test scripts/test-rate-limit.mjs`.
// Two separately-created middleware instances share one counter store, as API
// replicas do when backed by the database table.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { API_RATE_LIMIT_POLICIES, createSharedRateLimit } = require('../dist/http/rateLimit');

function sharedStore() {
  const counters = new Map();
  return {
    async increment(key) {
      const count = (counters.get(key) || 0) + 1;
      counters.set(key, count);
      return count;
    },
  };
}

function makeRequest(method, path, ip = '203.0.113.10') {
  return { method, path, ip, socket: { remoteAddress: ip } };
}

async function invoke(middleware, req) {
  const response = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let passed = false;
  await middleware(req, response, () => { passed = true; });
  return { ...response, passed };
}

test('waitlist limits are shared across independently-created API instances', async () => {
  const store = sharedStore();
  const policies = API_RATE_LIMIT_POLICIES.filter(({ name }) => name === 'waitlist');
  const instanceA = createSharedRateLimit(store, policies, () => 1_800_000_000_000);
  const instanceB = createSharedRateLimit(store, policies, () => 1_800_000_000_000);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const instance = attempt % 2 ? instanceB : instanceA;
    const result = await invoke(instance, makeRequest('POST', '/waitlist'));
    assert.equal(result.passed, true);
    assert.equal(result.statusCode, 200);
  }

  const blocked = await invoke(instanceB, makeRequest('POST', '/waitlist'));
  assert.equal(blocked.passed, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'] > 0, true);

  const otherIp = await invoke(instanceB, makeRequest('POST', '/waitlist', '203.0.113.11'));
  assert.equal(otherIp.passed, true);
});

test('authentication routes have separate limits and reset at the next window', async () => {
  const store = sharedStore();
  const policies = API_RATE_LIMIT_POLICIES.filter(({ name }) => ['login', 'signup'].includes(name));
  let now = 1_800_000_000_000;
  const instanceA = createSharedRateLimit(store, policies, () => now);
  const instanceB = createSharedRateLimit(store, policies, () => now);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await invoke(instanceA, makeRequest('POST', '/auth/login'));
    assert.equal(result.passed, true);
  }
  assert.equal((await invoke(instanceB, makeRequest('POST', '/auth/login'))).statusCode, 429);
  assert.equal((await invoke(instanceB, makeRequest('POST', '/auth/signup'))).passed, true);

  now += 15 * 60 * 1000;
  assert.equal((await invoke(instanceB, makeRequest('POST', '/auth/login'))).passed, true);
});
