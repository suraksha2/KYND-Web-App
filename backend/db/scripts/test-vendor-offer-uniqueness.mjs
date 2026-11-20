// Run after `npm run build` with:
// node --test scripts/test-vendor-offer-uniqueness.mjs
// Creates and drops only a disposable test database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import test from 'node:test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
const require = createRequire(import.meta.url);
const pool = require('../dist/lib/mysql').default;
const { claimLockedVendorOffer, lockVendorOffer } = require('../dist/lib/vendorOffers');

async function acceptOffer(vendorId, offerId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const locked = await lockVendorOffer(conn, vendorId, offerId);
    if (locked.state === 'accepted') {
      await conn.commit();
      return { status: 200, jobId: locked.jobId };
    }
    if (locked.state !== 'open' || !(await claimLockedVendorOffer(conn, locked.offer))) {
      await conn.rollback();
      return { status: 409 };
    }
    const [job] = await conn.query(
      `INSERT INTO jobs
        (vendor_id,offer_id,booking_id,source,status,customer_name,service_label,
         window_start,gross,fee_pct,net)
       VALUES (?,?,?,'kynd','accepted','Fixture',?,NOW(),0,0,0)`,
      [vendorId, locked.offer.id, locked.offer.booking_id, locked.offer.service_label]
    );
    await conn.commit();
    return { status: 200, jobId: job.insertId };
  } catch (error) {
    try { await conn.rollback(); } catch { }
    throw error;
  } finally {
    conn.release();
  }
}

test('vendor offer/job uniqueness cleanup and acceptance idempotency', async (t) => {
  const db = await pool.getConnection();
  const schemaName = `test_vendor_offer_unique_${process.pid}_${Date.now()}`;
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  const routedConnections = [];
  try {
    await db.query(`CREATE DATABASE \`${schemaName}\``);
    await db.query(`USE \`${schemaName}\``);
    pool.query = (...args) => db.query(...args);
    pool.getConnection = async () => {
      const conn = await originalGetConnection.call(pool);
      await conn.query(`USE \`${schemaName}\``);
      routedConnections.push(conn);
      return conn;
    };

    for (const ddl of [
      'CREATE TABLE vendors (id INT PRIMARY KEY, status VARCHAR(20))',
      `CREATE TABLE bookings (id INT PRIMARY KEY, provider_id INT, vendor_id INT, vendor_job_id INT,
        assigned_at DATETIME, contact_name VARCHAR(255), contact_phone VARCHAR(20),
        contact_address VARCHAR(255), contact_area VARCHAR(100))`,
      `CREATE TABLE offers (id INT AUTO_INCREMENT PRIMARY KEY, vendor_id INT, booking_id INT,
        service_label VARCHAR(255), category VARCHAR(100), area VARCHAR(100), window_start DATETIME,
        window_end DATETIME, price DECIMAL(10,2), fee_pct DECIMAL(5,2), status VARCHAR(20),
        expires_at DATETIME, accepted_at DATETIME)`,
      `CREATE TABLE jobs (id INT AUTO_INCREMENT PRIMARY KEY, vendor_id INT, offer_id INT, booking_id INT,
        source VARCHAR(20), status VARCHAR(20), assignee_provider_id INT, customer_name VARCHAR(255),
        customer_phone VARCHAR(20), customer_address VARCHAR(255), customer_area VARCHAR(100),
        service_label VARCHAR(255), category VARCHAR(100), window_start DATETIME, window_end DATETIME,
        gross DECIMAL(10,2), fee_pct DECIMAL(5,2), net DECIMAL(10,2))`,
    ]) await db.query(ddl);

    await db.query("INSERT INTO vendors VALUES (1,'active'),(2,'active')");
    await db.query(`INSERT INTO bookings (id,contact_name,contact_phone,contact_address,contact_area)
      VALUES (10,'Duplicate fixture',NULL,NULL,NULL)`);
    await db.query(`INSERT INTO offers
      (id,vendor_id,booking_id,service_label,window_start,price,fee_pct,status,expires_at)
      VALUES (1,1,10,'Old duplicate',NOW(),50,15,'open',DATE_ADD(NOW(),INTERVAL 1 HOUR)),
             (2,1,10,'Accepted duplicate',NOW(),50,15,'accepted',DATE_ADD(NOW(),INTERVAL 1 HOUR))`);
    await db.query(`INSERT INTO jobs (vendor_id,offer_id,booking_id,source,status,customer_name,
      service_label,window_start,gross,fee_pct,net)
      VALUES (1,2,10,'kynd','accepted','Fixture','Fixture',NOW(),50,0,50),
             (1,2,10,'kynd','completed','Fixture','Fixture',NOW(),50,0,50)`);

    // Run the actual migration against this disposable schema, omitting its
    // production database switch. Diagnostic SELECTs are intentionally run too.
    const migration = (await fs.readFile(
      new URL('../migrations/023-vendor-offer-job-uniqueness.sql', import.meta.url),
      'utf8'
    )).replace(/^\s*USE\s+urban_service\s*;\s*/im, '');
    for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
      await db.query(statement);
    }
    const [[offerCounts]] = await db.query(
      'SELECT COUNT(*) AS kept FROM offers WHERE booking_id = 10'
    );
    const [[jobCounts]] = await db.query(
      'SELECT COUNT(*) AS linked FROM jobs WHERE offer_id = 2'
    );
    const [[detached]] = await db.query(
      `SELECT COUNT(*) AS rows_kept FROM offers WHERE id = 1 AND booking_id IS NULL`
    );
    const [[detachedJobs]] = await db.query(
      'SELECT COUNT(*) AS rows_kept FROM jobs WHERE offer_id IS NULL'
    );
    assert.equal(Number(offerCounts.kept), 1);
    assert.equal(Number(jobCounts.linked), 1);
    assert.equal(Number(detached.rows_kept), 1);
    assert.equal(Number(detachedJobs.rows_kept), 1);
    for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
      await db.query(statement);
    }

    await db.query(`INSERT INTO bookings (id,contact_name) VALUES (11,'Concurrent fixture')`);
    await db.query(`INSERT INTO offers
      (id,vendor_id,booking_id,service_label,window_start,price,fee_pct,status,expires_at)
      VALUES (3,1,11,'Concurrent A',NOW(),80,15,'open',DATE_ADD(NOW(),INTERVAL 1 HOUR)),
             (4,2,11,'Concurrent B',NOW(),80,15,'open',DATE_ADD(NOW(),INTERVAL 1 HOUR))`);

    await t.test('retries return the committed job instead of creating another', async () => {
      const first = await acceptOffer(1, 3);
      const retry = await acceptOffer(1, 3);
      assert.deepEqual(retry, first);
      const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM jobs WHERE offer_id = 3');
      assert.equal(Number(count), 1);
    });

    await t.test('simultaneous sibling accepts cannot create two jobs', async () => {
      await db.query(`INSERT INTO bookings (id,contact_name) VALUES (12,'Race fixture')`);
      await db.query(`INSERT INTO offers
        (id,vendor_id,booking_id,service_label,window_start,price,fee_pct,status,expires_at)
        VALUES (5,1,12,'Race A',NOW(),80,15,'open',DATE_ADD(NOW(),INTERVAL 1 HOUR)),
               (6,2,12,'Race B',NOW(),80,15,'open',DATE_ADD(NOW(),INTERVAL 1 HOUR))`);
      const results = await Promise.all([acceptOffer(1, 5), acceptOffer(2, 6)]);
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM jobs WHERE booking_id = 12');
      assert.equal(Number(count), 1);
      const [[{ open }]] = await db.query(
        `SELECT COUNT(*) AS open FROM offers WHERE booking_id = 12 AND status = 'open'`
      );
      assert.equal(Number(open), 0);
    });

    await t.test('unique keys reject later duplicate writes', async () => {
      await assert.rejects(
        db.query(`INSERT INTO offers
          (vendor_id,booking_id,service_label,window_start,price,fee_pct,status,expires_at)
          VALUES (1,11,'duplicate',NOW(),1,15,'open',DATE_ADD(NOW(),INTERVAL 1 HOUR))`),
        (error) => error.code === 'ER_DUP_ENTRY'
      );
      await assert.rejects(
        db.query(`INSERT INTO jobs
          (vendor_id,offer_id,source,status,customer_name,service_label,window_start,gross,fee_pct,net)
          VALUES (1,3,'kynd','accepted','Fixture','Duplicate',NOW(),1,0,1)`),
        (error) => error.code === 'ER_DUP_ENTRY'
      );
    });
  } finally {
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
    for (const conn of routedConnections) conn.release();
    try { await db.query(`DROP DATABASE IF EXISTS \`${schemaName}\``); } catch { }
    db.release();
    await pool.end();
  }
});
