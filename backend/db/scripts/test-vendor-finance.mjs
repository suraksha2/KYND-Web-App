// npm run build && node --test scripts/test-vendor-finance.mjs
// Uses a disposable database, never application bookings or payout records.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
const require = createRequire(import.meta.url);
const pool = require('../dist/lib/mysql').default;
const { approvedVendorQuote, assignVendorFinancials, inheritVisitFinancials,
  recordVendorCompletion, vendorAmounts, VendorPricingError } = require('../dist/lib/vendorFinance');
const { runVendorPayoutBatch, payoutMemberJobs, attachPeriodJobs } = require('../dist/lib/payouts');
const { priceOrder, PricingError } = require('../dist/lib/pricing');

test('vendor rate, fee and payout reconciliation', async (t) => {
  const db = await pool.getConnection();
  const schemaName = `test_vendor_finance_${process.pid}_${Date.now()}`;
  const originalQuery = pool.query;
  const originalConnection = pool.getConnection;
  const originalRelease = db.release;
  try {
    await db.query(`CREATE DATABASE \`${schemaName}\``);
    await db.query(`USE \`${schemaName}\``);
    pool.query = db.query.bind(db);
    pool.getConnection = async () => db;
    db.release = () => {};
    for (const ddl of [
      'CREATE TABLE vendors (id INT PRIMARY KEY)',
      `CREATE TABLE service_providers (id INT PRIMARY KEY, vendor_id INT)`,
      `CREATE TABLE bookings (id INT PRIMARY KEY, items JSON, total DECIMAL(10,2), schedule VARCHAR(20),
        status VARCHAR(20) DEFAULT 'upcoming', provider_id INT, vendor_id INT,
        scheduled_at DATETIME, placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        contact_name VARCHAR(100) DEFAULT 'Test customer', contact_area VARCHAR(100))`,
      `CREATE TABLE booking_occurrences (id INT PRIMARY KEY, booking_id INT, seq INT, provider_id INT,
        status VARCHAR(20) DEFAULT 'upcoming', scheduled_at DATETIME, completed_at DATETIME)`,
      `CREATE TABLE catalog_services (id INT PRIMARY KEY, name VARCHAR(100), image VARCHAR(255),
        duration VARCHAR(50), default_partner_cost DECIMAL(10,2), markup_pct_override DECIMAL(5,2),
        status VARCHAR(20))`,
      `CREATE TABLE service_pricing_rules (id INT AUTO_INCREMENT PRIMARY KEY, service_id INT,
        strategy VARCHAR(30), params JSON)`,
      `CREATE TABLE vendor_service_categories (id INT PRIMARY KEY, vendor_id INT,
        status VARCHAR(20), reviewed_at DATETIME)`,
      `CREATE TABLE vendor_service_category_items (id INT PRIMARY KEY, vendor_category_id INT,
        catalog_service_id INT, price DECIMAL(10,2))`,
      `CREATE TABLE addons (id INT PRIMARY KEY, name VARCHAR(100), partner_cost DECIMAL(10,2))`,
      `CREATE TABLE vendor_payouts (id INT AUTO_INCREMENT PRIMARY KEY, vendor_id INT,
        period_start DATE, period_end DATE, jobs INT DEFAULT 0, gross DECIMAL(10,2) DEFAULT 0,
        fee DECIMAL(10,2) DEFAULT 0, net DECIMAL(10,2) DEFAULT 0, status VARCHAR(20), paid_at DATETIME)`,
      `CREATE TABLE jobs (id INT AUTO_INCREMENT PRIMARY KEY, vendor_id INT, booking_id INT, payout_id INT,
        source VARCHAR(20), status VARCHAR(20), gross DECIMAL(10,2), fee_pct DECIMAL(5,2),
        net DECIMAL(10,2), completed_at DATETIME, paid_at DATETIME, window_start DATETIME,
        service_label VARCHAR(100), customer_name VARCHAR(100), customer_area VARCHAR(100))`,
    ]) await db.query(ddl);
    const schema = await fs.readFile(new URL('../db.sql', import.meta.url), 'utf8');
    await db.query(schema.match(/CREATE TABLE IF NOT EXISTS vendor_booking_financials \([\s\S]*?\n\);/)[0]);
    await db.query('INSERT INTO vendors VALUES (1),(2)');
    await db.query('INSERT INTO service_providers VALUES (1,1),(2,2)');
    await db.query(`INSERT INTO catalog_services
      (id,name,image,duration,default_partner_cost,markup_pct_override,status) VALUES
      (1,'Massage 60 min',NULL,'1 hr',NULL,NULL,'live'),
      (2,'Massage 90 min',NULL,'1.5 hrs',NULL,NULL,'live'),
      (3,'Body Massage 90 min',NULL,'1.5 hrs',84.62,29.99,'live'),
      (4,'Quote only service',NULL,'1 hr',50,NULL,'live')`);
    await db.query(`INSERT INTO service_pricing_rules (service_id,strategy,params) VALUES
      (3,'flat',JSON_OBJECT('amount',110)),(4,'custom_quote',JSON_OBJECT())`);
    await db.query("INSERT INTO vendor_service_categories VALUES (1,1,'live',NOW()),(2,2,'under_review',NULL)");
    await db.query('INSERT INTO vendor_service_category_items VALUES (1,1,1,80),(2,2,1,90),(3,1,3,80)');
    await db.query("INSERT INTO addons VALUES (1,'Supplies',5),(2,'Unpriced',NULL)");
    const items = [{ catalogId: 1, name: 'Massage 60 min', qty: 1 }];
    await db.query(`INSERT INTO bookings (id,items,total,schedule,provider_id,scheduled_at)
      VALUES (1,?,100,'scheduled',1,NOW()),(2,?,100,'recurring',1,NOW()),(3,?,100,'scheduled',1,NOW()),
             (4,?,100,'scheduled',1,NOW()),(5,?,100,'scheduled',1,NOW())`,
    Array(5).fill(JSON.stringify(items)));
    const booking = async (id) => (await db.query('SELECT * FROM bookings WHERE id = ?', [id]))[0][0];

    await t.test('a flat customer price is not marked up and stays separate from the vendor rate', async () => {
      const priced = await priceOrder({
        items: [{ catalogId: 3, name: 'Body Massage 90 min', qty: 1 }],
      });
      assert.equal(priced.total, 110);
      assert.equal(priced.items[0].priceFrom, 110);
      const vendorQuote = await approvedVendorQuote(1, [
        { catalogId: 3, name: 'Body Massage 90 min', qty: 1 },
      ], db);
      assert.deepEqual(
        { gross: vendorQuote.gross, fee: vendorQuote.fee, net: vendorQuote.net },
        { gross: 80, fee: 12, net: 68 }
      );
      await assert.rejects(
        priceOrder({ items: [{ catalogId: 4, name: 'Quote only service', qty: 1 }] }),
        PricingError
      );
    });

    await t.test('100 customer / 80 approved vendor / 12 fee / 68 net, with cent rounding', async () => {
      const q = await approvedVendorQuote(1, items, db);
      assert.deepEqual({ gross: q.gross, fee: q.fee, net: q.net, feePct: q.feePct },
        { gross: 80, fee: 12, net: 68, feePct: 15 });
      assert.deepEqual(vendorAmounts(10.01), { gross: 10.01, feePct: 15, fee: 1.5, net: 8.51 });
      assert.equal(vendorAmounts(80, 0).net, 80);
      assert.throws(() => vendorAmounts(80, 101), VendorPricingError);
      const multi = await approvedVendorQuote(1, [{ ...items[0], qty: 2 }, { addonId: 1, qty: 1 }], db);
      assert.equal(multi.gross, 165);
      assert.equal(multi.fee, 24.75);
      assert.equal(multi.net, 140.25);
    });
    await t.test('draft/review/rejected rates, unmatched variants and unpriced add-ons cannot be used', async () => {
      for (const status of ['draft', 'under_review', 'rejected']) {
        await db.query('UPDATE vendor_service_categories SET status = ? WHERE id = 2', [status]);
        await assert.rejects(approvedVendorQuote(2, items, db), VendorPricingError);
      }
      await assert.rejects(approvedVendorQuote(1, [{ catalogId: 2 }], db), VendorPricingError);
      await assert.rejects(approvedVendorQuote(1, [{ addonId: 2 }], db), VendorPricingError);
      await db.query("UPDATE vendor_service_categories SET status='live' WHERE id=2");
    });
    await t.test('snapshots survive rate changes and same-vendor cover; replacement uses its own rate', async () => {
      await assignVendorFinancials(db, await booking(1), 1);
      await assignVendorFinancials(db, await booking(2), 1);
      await db.query('UPDATE vendor_service_category_items SET price=120 WHERE id=1');
      await assignVendorFinancials(db, await booking(1), 1);
      let [[f]] = await db.query('SELECT * FROM vendor_booking_financials WHERE booking_id=1');
      assert.equal(Number(f.gross), 80);
      assert.equal(Number(f.fee_pct), 0);
      assert.equal(Number(f.customer_total), 100);
      await assignVendorFinancials(db, await booking(1), 2);
      [[f]] = await db.query('SELECT * FROM vendor_booking_financials WHERE booking_id=1');
      assert.equal(Number(f.net), 80);
      await db.query('UPDATE bookings SET provider_id=2 WHERE id=1');
      await db.query('UPDATE vendor_service_category_items SET price=80 WHERE id=1');
    });
    await t.test('each recurring visit inherits the series snapshot, without duplicating existing visits', async () => {
      await db.query(`INSERT INTO booking_occurrences VALUES (21,2,1,1,'upcoming',NOW(),NULL),(22,2,2,1,'upcoming',NOW(),NULL)`);
      await inheritVisitFinancials(db, 2);
      await inheritVisitFinancials(db, 2);
      const [rows] = await db.query('SELECT * FROM vendor_booking_financials WHERE booking_id=2 ORDER BY occurrence_key');
      assert.equal(rows.length, 3);
      assert.deepEqual(rows.map(r => Number(r.net)), [80,80,80]);
      await assignVendorFinancials(db, await booking(2), 2, 22);
      await db.query('UPDATE booking_occurrences SET provider_id=2 WHERE id=22');
      const [[f]] = await db.query('SELECT net FROM vendor_booking_financials WHERE booking_id=2 AND occurrence_key=22');
      assert.equal(Number(f.net), 80);
    });
    await t.test('completion is recorded once, and closed visits cannot be repriced', async () => {
      await db.query("UPDATE bookings SET status='completed' WHERE id=1");
      await recordVendorCompletion(db,1,0,true);
      await recordVendorCompletion(db,1,0,true);
      await assert.rejects(assignVendorFinancials(db,await booking(1),1),VendorPricingError);
      await db.query("UPDATE booking_occurrences SET status='completed',completed_at=NOW() WHERE id=21");
      await recordVendorCompletion(db,2,21,true);
      // Put earnings in a closed week to test attachment and batch idempotence.
      await db.query('UPDATE vendor_booking_financials SET completed_at=DATE_SUB(NOW(),INTERVAL 14 DAY) WHERE completed_at IS NOT NULL');
      await db.query(`INSERT INTO jobs (vendor_id,source,status,gross,fee_pct,net,completed_at,window_start)
        VALUES (1,'kynd','completed',40,0,40,DATE_SUB(NOW(),INTERVAL 14 DAY),NOW()),
               (1,'own','completed',900,0,900,DATE_SUB(NOW(),INTERVAL 14 DAY),NOW())`);
    });
    await t.test('payouts include legacy jobs plus completed visits once, excluding own jobs and series templates', async () => {
      const first = await runVendorPayoutBatch();
      assert.equal(first.jobsBatched, 3);
      const again = await runVendorPayoutBatch();
      assert.equal(again.jobsBatched,0);
      assert.equal(again.created,0);
      const [payouts] = await db.query('SELECT * FROM vendor_payouts ORDER BY vendor_id');
      assert.equal(payouts.length,2);
      assert.equal(Number(payouts[0].net),102); // 34 legacy + 68 visit
      assert.equal(Number(payouts[1].net),76.5);
      for (const payout of payouts) {
        const members = await payoutMemberJobs(payout);
        assert.equal(members.length,Number(payout.jobs));
        assert.equal(Math.round(members.reduce((sum,j)=>sum+Number(j.net),0)*100),Math.round(Number(payout.net)*100));
      }
      await assert.rejects(recordVendorCompletion(db,1,0,false),VendorPricingError);
      await db.query("UPDATE bookings SET status='cancelled' WHERE id=2");
      assert.equal((await payoutMemberJobs(payouts[0])).length, 2); // completed visit still owed
    });
    await t.test('current-week accrual, finalisation and cancelled visits reconcile', async () => {
      await assignVendorFinancials(db,await booking(3),1);
      await assignVendorFinancials(db,await booking(4),1);
      await db.query("UPDATE bookings SET status='completed' WHERE id IN (3,4)");
      await recordVendorCompletion(db,3,0,true);
      await recordVendorCompletion(db,4,0,true);
      await db.query("UPDATE bookings SET status='cancelled' WHERE id=4");
      await runVendorPayoutBatch();
      const [[payout]] = await db.query("SELECT * FROM vendor_payouts WHERE vendor_id=1 AND status='scheduled'");
      assert.equal(Number(payout.net),68);
      assert.equal((await payoutMemberJobs(payout)).length,1);
      await db.query("UPDATE bookings SET status='upcoming' WHERE id=3");
      await recordVendorCompletion(db,3,0,false);
      await runVendorPayoutBatch();
      const [[empty]] = await db.query('SELECT net FROM vendor_payouts WHERE id=?',[payout.id]);
      assert.equal(Number(empty.net),0); // no stale scheduled amount after reopening
      await db.query("UPDATE bookings SET status='completed' WHERE id=3");
      await recordVendorCompletion(db,3,0,true);
      await runVendorPayoutBatch();
      await attachPeriodJobs(db,payout.id,1,payout.period_start,payout.period_end);
      await db.query("UPDATE vendor_payouts SET status='paid',paid_at=NOW() WHERE id=?",[payout.id]);
      await runVendorPayoutBatch();
      const [[total]] = await db.query('SELECT SUM(net) AS net FROM vendor_payouts WHERE vendor_id=1');
      assert.equal(Number(total.net),170);
    });
    await t.test('a booking represented by a legacy job is not paid twice', async () => {
      await assignVendorFinancials(db,await booking(5),1);
      await db.query("UPDATE bookings SET status='completed' WHERE id=5");
      await recordVendorCompletion(db,5,0,true);
      await db.query(`INSERT INTO jobs (vendor_id,booking_id,source,status,gross,fee_pct,net,completed_at)
        VALUES (1,5,'kynd','completed',80,15,68,NOW())`);
      await runVendorPayoutBatch();
      const [[total]] = await db.query('SELECT SUM(net) AS net FROM vendor_payouts WHERE vendor_id=1');
      assert.equal(Number(total.net),238); // add 68 once, not 136
    });
  } finally {
    pool.query = originalQuery;
    pool.getConnection = originalConnection;
    db.release = originalRelease;
    try { await db.query(`DROP DATABASE IF EXISTS \`${schemaName}\``); } finally {
      db.destroy();
      await pool.end();
    }
  }
});
