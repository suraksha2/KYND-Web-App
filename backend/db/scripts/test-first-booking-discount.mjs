// npm run build && node --test scripts/test-first-booking-discount.mjs
// Uses an isolated disposable database; no customer or booking rows are changed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url);
const pool = require('../dist/lib/mysql').default;
const { claimFirstBookingDiscount } = require('../dist/lib/firstBookingDiscount');

test('concurrent checkouts for one customer cannot both claim the first-booking discount', async () => {
  const admin = await pool.getConnection();
  const schemaName = `test_first_discount_${process.pid}_${Date.now()}`;
  let first;
  let second;
  try {
    await admin.query(`CREATE DATABASE \`${schemaName}\``);
    first = await pool.getConnection();
    second = await pool.getConnection();
    await first.query(`USE \`${schemaName}\``);
    await second.query(`USE \`${schemaName}\``);
    await first.query(`CREATE TABLE first_booking_discount_redemptions (
      user_id INT NOT NULL PRIMARY KEY,
      booking_id INT NULL UNIQUE,
      redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);

    await first.beginTransaction();
    assert.equal(await claimFirstBookingDiscount(first, 42), true);
    await second.beginTransaction();
    const concurrentClaim = claimFirstBookingDiscount(second, 42);

    // Keep the first claim uncommitted while the competing insert encounters
    // the unique key; after commit, MySQL must report the second as a duplicate.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await first.commit();
    assert.equal(await concurrentClaim, false);
    await second.rollback();

    const [[{ redemptions }]] = await first.query(
      'SELECT COUNT(*) AS redemptions FROM first_booking_discount_redemptions WHERE user_id = 42'
    );
    assert.equal(Number(redemptions), 1);
  } finally {
    if (first) {
      try { await first.rollback(); } catch {}
      first.release();
    }
    if (second) {
      try { await second.rollback(); } catch {}
      second.release();
    }
    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${schemaName}\``);
    } finally {
      admin.release();
      await pool.end();
    }
  }
});
