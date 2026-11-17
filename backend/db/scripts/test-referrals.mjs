import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  isLegacyReferralCode,
  newReferralCode,
  validateReferralCode,
} = require('../dist/lib/referrals');

function referralDb(referrerId) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return [referrerId === null ? [] : [{ id: referrerId, name: 'Private Customer' }], []];
    },
  };
}

test('new referral codes are random and legacy user-ID codes are identified', () => {
  const code = newReferralCode();
  assert.match(code, /^KYND-[A-F0-9]{14}$/);
  assert.equal(code.length, 19);
  assert.equal(isLegacyReferralCode('KYND-12345'), true);
  assert.equal(isLegacyReferralCode(code), false);
});

test('invalid referral codes reveal neither referrer nor customer data', async () => {
  const db = referralDb(null);
  const result = await validateReferralCode('NOT-A-CODE', undefined, db);
  assert.deepEqual(result, { valid: false, discount: 0 });
  assert.deepEqual(Object.keys(result).sort(), ['discount', 'valid']);

  const missing = await validateReferralCode(undefined, undefined, db);
  assert.deepEqual(missing, { valid: false, discount: 0 });
});

test('self-referrals are invalid without revealing the matching customer', async () => {
  const db = referralDb(42);
  const result = await validateReferralCode('KYND-0123456789ABCD', 42, db);
  assert.deepEqual(result, { valid: false, discount: 0 });
  assert.deepEqual(Object.keys(result).sort(), ['discount', 'valid']);
  assert.doesNotMatch(db.queries[0].sql, /name/i);
});

test('valid referrals return only validity and discount', async () => {
  const db = referralDb(84);
  const result = await validateReferralCode('kynd-0123456789abcd', 42, db);
  assert.deepEqual(result, { valid: true, discount: 15 });
  assert.deepEqual(Object.keys(result).sort(), ['discount', 'valid']);
  assert.doesNotMatch(db.queries[0].sql, /name/i);
});

test('legacy enumerable referral codes are rejected', async () => {
  const db = referralDb(42);
  const result = await validateReferralCode('KYND-42', 7, db);
  assert.deepEqual(result, { valid: false, discount: 0 });
  assert.equal(db.queries.length, 0);
});
