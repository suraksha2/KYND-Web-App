// Smoke test: invoke GET /api/vendors/dashboard through the real router with a
// mock req/res, against the configured local DB. Read-only SELECTs only.
// Run from backend/db: node scripts/smoke-vendor-dashboard.mjs
import dotenv from 'dotenv';
import { createRequire } from 'node:module';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const require = createRequire(import.meta.url);
const router = require('../dist/routes/vendors').default;

setTimeout(() => { console.log('TIMEOUT — check DB connectivity'); process.exit(2); }, 45000).unref();

function mockRes(resolve) {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; resolve(this); return this; },
    send(payload) { this.body = payload; resolve(this); return this; },
    setHeader() {},
  };
}

async function hit(query) {
  const req = {
    method: 'GET',
    url: '/dashboard',
    originalUrl: '/dashboard',
    path: '/dashboard',
    query,
    params: {},
    headers: {},
    body: {},
    get(name) { return this.headers[name.toLowerCase()]; },
  };
  // Router.handle's `out` callback only fires when no layer matches; a matched
  // handler ends at res.json/send, so resolve there instead.
  return await new Promise((resolve) => {
    const res = mockRes(resolve);
    router.handle(req, res, () => resolve({ statusCode: 404, body: 'no route matched' }));
  });
}

const res = await hit({ from: '2026-09-01', to: '2026-10-27' });
console.log('status:', res.statusCode);
if (res.statusCode !== 200) {
  console.log('error body:', res.body);
  process.exit(1);
}
const d = res.body;
console.log('range:', d.range);
console.log('kpi:', JSON.stringify(d.kpi, null, 1));
console.log('offers:', JSON.stringify(d.offers));
console.log('byCategory:', JSON.stringify(d.byCategory));
console.log('trend points:', d.trend.length, d.trend.slice(0, 3));
console.log('vendors:', d.vendors.length);
for (const v of d.vendors) console.log(' -', JSON.stringify(v));

// default range path (no params)
const res2 = await hit({});
console.log('\ndefault-range status:', res2.statusCode, 'range:', res2.body?.range);

// bad range
const res3 = await hit({ from: '2020-01-01', to: '2030-01-01' });
console.log('over-400d status:', res3.statusCode, JSON.stringify(res3.body));
process.exit(0);
