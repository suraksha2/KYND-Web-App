import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { formatSingaporePhoneInput, isValidSingaporePhone, normalizeSingaporePhone } from '../../../src/lib/phone.js';

const require = createRequire(import.meta.url);
const { normalizeRecurrence, recurrenceOffsetDays } = require('../dist/lib/recurrence');
const { catalogSkillTagsForService } = require('../dist/lib/providerSkills');
const { providerSlots } = require('../dist/routes/availability');

const projectRoot = path.resolve(import.meta.dirname, '../../..');

test('Singapore phone helpers format and reject non-Singapore mobile numbers', () => {
  assert.equal(formatSingaporePhoneInput('9123 4567'), '+6591234567');
  assert.equal(normalizeSingaporePhone('65 8123 4567'), '+6581234567');
  assert.equal(isValidSingaporePhone('+6561234567'), false);
  assert.equal(isValidSingaporePhone('+919910483315'), false);
});

test('custom recurrence spreads visits across the unit without interval drift', () => {
  const start = new Date('2026-11-16T10:00:00+08:00');
  const plan = normalizeRecurrence({ type: 'custom', times: 3, unit: 'week' }, null, start);
  assert.ok(plan);
  const days = plan.occurrences.map((visit) =>
    (Date.parse(visit) - start.getTime()) / 86400000
  );
  assert.deepEqual(days, [0, 2, 5, 7]);
  assert.equal(recurrenceOffsetDays(plan, 4), 9);
  assert.equal(normalizeRecurrence({ type: 'custom', times: 1.5, unit: 'week' }, null, start), null);
  assert.equal(normalizeRecurrence({ type: 'custom', times: 2, unit: 'day' }, null, start), null);
});

test('catalog service name is tried when a submitted service id is stale', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('WHERE s.id = ?')) return [[]];
      return [[{
        service_name: 'Head Massage 30 min',
        subcategory_name: 'Head Massage',
        category_name: 'Wellness @ Home',
      }]];
    },
  };
  const tags = await catalogSkillTagsForService(
    { id: 99999, name: 'Head Massage 30 min' },
    db
  );
  assert.deepEqual(tags, ['Head Massage 30 min', 'Head Massage', 'Wellness @ Home']);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params, ['Head Massage 30 min']);
});

test('availability omits slots that have already started', () => {
  const now = Date.parse('2026-11-14T10:15:00+08:00');
  const slots = providerSlots(
    {
      id: 7,
      working_hours: { sat: { start: '09:00', end: '12:00' } },
    },
    '2026-11-14',
    30,
    [],
    now
  );
  assert.deepEqual(slots.slice(0, 2), ['10:30', '11:00']);
  assert.ok(!slots.includes('09:00'));
  assert.ok(!slots.includes('10:00'));
});

test('SGT correction migration has an idempotency marker and dispatcher uses a DB lock', () => {
  const migration = fs.readFileSync(
    path.join(projectRoot, 'backend/db/migrations/002-correct-sgt-datetimes.sql'),
    'utf8'
  );
  const dispatcher = fs.readFileSync(
    path.join(projectRoot, 'backend/db/src/routes/internal.ts'),
    'utf8'
  );
  assert.match(migration, /INSERT IGNORE INTO schema_migrations/);
  assert.match(migration, /WHERE @apply_sgt_correction = 1/);
  assert.match(dispatcher, /GET_LOCK\('dispatch_due_notifications', 0\)/);
  assert.match(dispatcher, /RELEASE_LOCK\('dispatch_due_notifications'\)/);
});

test('checkout uses the configured API base exactly once for payment intent routes', () => {
  const checkout = fs.readFileSync(
    path.join(projectRoot, 'src/pages/Checkout.jsx'),
    'utf8'
  );
  const confirmation = fs.readFileSync(
    path.join(projectRoot, 'src/pages/BookingConfirmed.jsx'),
    'utf8'
  );
  assert.match(checkout, /import \{ API_BASE, apiFetch, appUrl \} from '\.\.\/lib\/api'/);
  assert.match(checkout, /`\$\{API_BASE\}\/payments\/create-intent`/);
  assert.doesNotMatch(checkout, /`\$\{API_BASE\}\/api\/payments\/create-intent`/);
  assert.match(confirmation, /import \{ API_ORIGIN as API_BASE, serviceImageUrl \} from '\.\.\/lib\/api'/);
  assert.match(confirmation, /`\$\{API_BASE\}\/api\/payments\/\$\{encodeURIComponent\(key\)\}`/);
  assert.match(confirmation, /`\$\{API_BASE\}\/api\/bookings`/);
  assert.match(confirmation, /encodeURIComponent\(key\)/);
});

test('provider assignment locks the roster before checking and saving a booking', () => {
  const bookings = fs.readFileSync(
    path.join(projectRoot, 'backend/db/src/routes/bookings.ts'),
    'utf8'
  );
  const createRoute = bookings.slice(
    bookings.indexOf("router.post('/',"),
    bookings.indexOf("router.get('/',")
  );
  const transaction = createRoute.indexOf('await conn.beginTransaction()');
  const rosterLock = createRoute.indexOf('ORDER BY sp.id ASC\n          FOR UPDATE');
  const availabilityCheck = createRoute.indexOf('findAvailableProvider(candidates');
  const assignmentSave = createRoute.indexOf('UPDATE bookings SET provider_id');
  assert.ok(transaction >= 0 && transaction < rosterLock);
  assert.ok(rosterLock < availabilityCheck && availabilityCheck < assignmentSave);
});

test('auth errors do not reveal whether an account is inactive or passwordless', () => {
  const auth = fs.readFileSync(
    path.join(projectRoot, 'backend/db/src/routes/auth.ts'),
    'utf8'
  );
  assert.doesNotMatch(auth, /Account is inactive|No password set for this account|vendor account is inactive/);
  assert.doesNotMatch(auth, /An account with this email already exists/);
  assert.match(auth, /Unable to create account\. Please check your details or sign in\./);
});
