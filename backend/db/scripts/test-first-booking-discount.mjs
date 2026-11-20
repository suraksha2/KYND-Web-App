// npm run build && node --test scripts/test-first-booking-discount.mjs
// Uses an isolated disposable database; no customer or booking rows are changed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url);
const pool = require('../dist/lib/mysql').default;
const {
  attachFirstBookingDiscountToBooking,
  claimFirstBookingDiscount,
  releaseAbandonedFirstBookingDiscount,
  reserveFirstBookingDiscount,
} = require('../dist/lib/firstBookingDiscount');

test('first-booking discount reservations are exclusive and payment-bound', async (t) => {
  const admin = await pool.getConnection();
  const schemaName = `test_first_discount_${process.pid}_${Date.now()}`;
  const migrationSchemaName = `${schemaName}_migration`;
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
      payment_intent_id VARCHAR(128) NULL UNIQUE,
      status ENUM('reserved', 'redeemed') NOT NULL DEFAULT 'redeemed',
      redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);

    await t.test('competing intents cannot both reserve one customer offer', async () => {
      await first.beginTransaction();
      assert.equal(await reserveFirstBookingDiscount(first, 42, 'pi_checkout_a'), true);
      await second.beginTransaction();
      const concurrentClaim = reserveFirstBookingDiscount(second, 42, 'pi_checkout_b');

      // Keep the first claim uncommitted while the competing insert encounters
      // the unique key; after commit, MySQL must report the second as a duplicate.
      await new Promise((resolve) => setTimeout(resolve, 50));
      await first.commit();
      assert.equal(await concurrentClaim, false);
      await second.rollback();

      const [[reservation]] = await first.query(
        'SELECT user_id, booking_id, payment_intent_id, status FROM first_booking_discount_redemptions WHERE user_id = 42'
      );
      assert.deepEqual(reservation, {
        user_id: 42,
        booking_id: null,
        payment_intent_id: 'pi_checkout_a',
        status: 'reserved',
      });
    });

    await t.test('only the reservation owner can consume it for a booking', async () => {
      await first.beginTransaction();
      assert.equal(await claimFirstBookingDiscount(first, 42, 'pi_checkout_b'), false);
      assert.equal(await claimFirstBookingDiscount(first, 42, 'pi_checkout_a'), true);
      await attachFirstBookingDiscountToBooking(first, 42, 123);
      await first.commit();

      const [[redeemed]] = await first.query(
        'SELECT booking_id, payment_intent_id, status FROM first_booking_discount_redemptions WHERE user_id = 42'
      );
      assert.deepEqual(redeemed, {
        booking_id: 123,
        payment_intent_id: 'pi_checkout_a',
        status: 'redeemed',
      });
    });

    await t.test('an abandoned unpaid intent is cancelled before releasing its reservation', async () => {
      await reserveFirstBookingDiscount(first, 7, 'pi_abandoned');
      const calls = [];
      assert.equal(await releaseAbandonedFirstBookingDiscount(first, 7, {
        retrieve: async (id) => {
          calls.push(['retrieve', id]);
          return { status: 'REQUIRES_PAYMENT_METHOD' };
        },
        cancel: async (id) => {
          calls.push(['cancel', id]);
          return { status: 'CANCELLED' };
        },
      }), true);
      assert.deepEqual(calls, [
        ['retrieve', 'pi_abandoned'],
        ['cancel', 'pi_abandoned'],
      ]);
    });

    await t.test('paid and provider-unknown intents retain their reservation', async () => {
      await reserveFirstBookingDiscount(first, 8, 'pi_paid');
      assert.equal(await releaseAbandonedFirstBookingDiscount(first, 8, {
        retrieve: async () => ({ status: 'SUCCEEDED' }),
        cancel: async () => { throw new Error('A succeeded intent must not be cancelled.'); },
      }), false);

      await reserveFirstBookingDiscount(first, 9, 'pi_unknown');
      assert.equal(await releaseAbandonedFirstBookingDiscount(first, 9, {
        retrieve: async () => { throw new Error('Provider unavailable.'); },
        cancel: async () => ({ status: 'CANCELLED' }),
      }), false);
      const [[row]] = await first.query(
        'SELECT payment_intent_id, status FROM first_booking_discount_redemptions WHERE user_id = 8'
      );
      assert.deepEqual(row, { payment_intent_id: 'pi_paid', status: 'reserved' });
    });

    await t.test('migration upgrades a legacy table idempotently and preserves redeemed rows', async () => {
      await admin.query(`CREATE DATABASE \`${migrationSchemaName}\``);
      await first.query(`USE \`${migrationSchemaName}\``);
      await first.query(`CREATE TABLE first_booking_discount_redemptions (
        user_id INT NOT NULL PRIMARY KEY,
        booking_id INT NULL UNIQUE,
        redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
      await first.query(
        'INSERT INTO first_booking_discount_redemptions (user_id, booking_id) VALUES (55, 812)'
      );

      const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
      const migration = readFileSync(
        path.join(projectRoot, 'backend/db/migrations/024-first-booking-payment-reservations.sql'),
        'utf8'
      )
        .replace(/^\s*USE urban_service;\s*/m, '')
        .replace(/^\s*--.*$/gm, '');
      const statements = migration.split(';').map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) await first.query(statement);
      for (const statement of statements) await first.query(statement);

      const [[row]] = await first.query(
        'SELECT user_id, booking_id, payment_intent_id, status FROM first_booking_discount_redemptions WHERE user_id = 55'
      );
      assert.deepEqual(row, {
        user_id: 55,
        booking_id: 812,
        payment_intent_id: null,
        status: 'redeemed',
      });
      const [indexes] = await first.query(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'first_booking_discount_redemptions'
            AND INDEX_NAME = 'unique_first_booking_payment_intent'`
      );
      assert.equal(indexes.length, 1);
    });

    await t.test('payment checkout migration creates the recovery snapshot table idempotently', async () => {
      await first.query('CREATE TABLE users (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB');
      const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
      const migration = readFileSync(
        path.join(projectRoot, 'backend/db/migrations/025-payment-checkouts.sql'),
        'utf8'
      )
        .replace(/^\s*USE urban_service;\s*/m, '')
        .replace(/^\s*--.*$/gm, '');
      const statements = migration.split(';').map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) await first.query(statement);
      for (const statement of statements) await first.query(statement);

      const [columns] = await first.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_checkouts'`
      );
      assert.deepEqual(
        columns.map((column) => column.COLUMN_NAME).sort(),
        ['booking_ref', 'created_at', 'last_reconciled_at', 'order_json', 'payment_intent_id', 'user_id'].sort()
      );
      const [[foreignKey]] = await first.query(
        `SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_checkouts'
            AND COLUMN_NAME = 'user_id'`
      );
      assert.equal(foreignKey.REFERENCED_TABLE_NAME, 'users');
    });

    await t.test('reconciliation migration upgrades existing checkout tables idempotently', async () => {
      await first.query(
        'ALTER TABLE payment_checkouts DROP INDEX idx_payment_checkouts_reconcile, DROP COLUMN last_reconciled_at'
      );
      const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
      const migration = readFileSync(
        path.join(projectRoot, 'backend/db/migrations/026-payment-checkout-reconciliation.sql'),
        'utf8'
      )
        .replace(/^\s*USE urban_service;\s*/m, '')
        .replace(/^\s*--.*$/gm, '');
      const statements = migration.split(';').map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) await first.query(statement);
      for (const statement of statements) await first.query(statement);

      const [columns] = await first.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_checkouts'
            AND COLUMN_NAME = 'last_reconciled_at'`
      );
      const [[indexCount]] = await first.query(
        `SELECT COUNT(DISTINCT INDEX_NAME) AS index_count FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_checkouts'
            AND INDEX_NAME = 'idx_payment_checkouts_reconcile'`
      );
      assert.equal(columns.length, 1);
      assert.equal(Number(indexCount.index_count), 1);
    });
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
      await admin.query(`DROP DATABASE IF EXISTS \`${migrationSchemaName}\``);
      await admin.query(`DROP DATABASE IF EXISTS \`${schemaName}\``);
    } finally {
      admin.release();
      await pool.end();
    }
  }
});

test('the payment route reserves before returning a first-discount client secret', () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const payments = readFileSync(
    path.join(projectRoot, 'backend/db/src/routes/payments.ts'),
    'utf8'
  );
  const createRoute = payments.slice(payments.indexOf("router.post('/create-intent'"));
  assert.ok(createRoute.indexOf('releaseAbandonedFirstBookingDiscount(')
    < createRoute.indexOf('await priceOrder('));
  assert.ok(createRoute.indexOf('await priceOrder(')
    < createRoute.indexOf('await createPaymentIntent('));
  assert.ok(createRoute.indexOf('await createPaymentIntent(')
    < createRoute.indexOf('await reserveFirstBookingDiscount('));
  assert.ok(createRoute.indexOf('await reserveFirstBookingDiscount(')
    < createRoute.indexOf('clientSecret: intent.client_secret'));
});
