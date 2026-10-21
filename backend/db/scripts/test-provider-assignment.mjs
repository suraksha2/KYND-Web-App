// After npm run build, run node --test scripts/test-provider-assignment.mjs.
// Fixtures only live in temporary tables on
// this connection; existing bookings, jobs and leave are never changed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
const require = createRequire(import.meta.url);
const pool = require('../dist/lib/mysql').default;
const { assignmentContext, saveAssignment } = require('../dist/lib/bookingAssignment');
const { completeNextOccurrence } = require('../dist/lib/occurrences');
const { providerSupportsServices } = require('../dist/lib/providerSkills');
const {
  bookingDurationMinutes, providerWorkingHours, isFreeAt,
  findAvailableProvider, loadProviderSchedule,
} = require('../dist/lib/providerSchedule');

test('direct assignment respects skills and the combined provider schedule', async (t) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(`CREATE TEMPORARY TABLE bookings (
      id INT, provider_id INT, scheduled_at DATETIME, items JSON, status VARCHAR(20)
    )`);
    await conn.query(`CREATE TEMPORARY TABLE booking_occurrences (
      id INT, booking_id INT, provider_id INT, scheduled_at DATETIME, status VARCHAR(20)
    )`);
    await conn.query(`CREATE TEMPORARY TABLE jobs (
      assignee_provider_id INT, window_start DATETIME, window_end DATETIME, status VARCHAR(20)
    )`);
    await conn.query(`CREATE TEMPORARY TABLE team_member_leave (
      provider_id INT, start_date DATE, end_date DATE
    )`);
    const workers = [
      { id: 1, services: '["Head Massage"]' },
      { id: 2, services: ['Wellness @ Home'] },
    ];
    const tags = ['Head Massage 60 min', 'Head Massage', 'Wellness @ Home'];
    const visit = (day, time = '10:00') => new Date(`2030-01-${day}T${time}:00+08:00`);
    const pick = (visits = [visit('07')], candidates = workers, duration = 60) =>
      findAvailableProvider(candidates, visits, duration, conn);

    await t.test('matches exact, subcategory and category skills, requiring every item', () => {
      assert.equal(providerSupportsServices(workers[0], [tags]), true);
      assert.equal(providerSupportsServices(workers[1], [tags]), true);
      assert.equal(providerSupportsServices({ services: [' head massage 60 MIN '] }, [tags]), true);
      assert.equal(providerSupportsServices(workers[0], [tags, ['Cleaning']]), false);
      assert.equal(providerSupportsServices({ services: 'bad-json' }, [tags]), false);
    });

    await t.test('keeps candidate order when free and returns null without candidates', async () => {
      assert.equal((await pick()).id, 1);
      assert.equal(await pick([visit('07')], []), null);
    });

    await conn.query(`INSERT INTO bookings VALUES
      (1, 1, '2030-01-07 10:00:00', '[{"duration":"2 hours"}]', 'upcoming')`);
    await t.test('skips a busy worker and never falls back when everyone is busy', async () => {
      assert.equal((await pick()).id, 2);
      assert.equal(await pick([visit('07')], [workers[0]]), null);
      assert.equal((await pick([visit('07', '12:00')])).id, 1);
    });

    await conn.query(`INSERT INTO jobs VALUES (2, '2030-01-07 09:30:00', NULL, 'assigned')`);
    await t.test('vendor jobs block assignment and the calendar, including default job duration', async () => {
      assert.equal(await pick(), null);
      const busy = await loadProviderSchedule([1, 2], ['2030-01-07'], conn);
      assert.equal(isFreeAt(workers[1], providerWorkingHours(workers[1]), visit('07'), 60, busy), false);
      assert.equal((await pick([visit('07', '11:30')])).id, 2);
    });

    await conn.query(`INSERT INTO bookings VALUES
      (2, 1, '2030-01-08 10:00:00', '[{"duration":"1 hour"}]', 'upcoming'),
      (3, 2, '2030-01-08 10:00:00', '[{"duration":"1 hour"}]', 'cancelled')`);
    await conn.query(`INSERT INTO booking_occurrences VALUES
      (1, 2, 1, '2030-01-14 10:00:00', 'upcoming'),
      (2, 3, 2, '2030-01-14 10:00:00', 'upcoming')`);
    await t.test('checks repeat visits, ignores cancelled parents and avoids stale parent times', async () => {
      assert.equal((await pick([visit('08'), visit('14')])).id, 2);
      assert.equal((await pick([visit('08')])).id, 1);
      assert.equal(await pick([visit('08'), visit('14')], [workers[0]]), null);
      const busy = await loadProviderSchedule([1], ['2030-01-14'], conn, 1);
      assert.equal(isFreeAt(workers[0], providerWorkingHours(workers[0]), visit('14'), 60, busy), true);
    });

    await conn.query(`INSERT INTO team_member_leave VALUES (2, '2030-01-08', '2030-01-14')`);
    await t.test('leave includes both boundary dates and prevents conflicting recurring assignments', async () => {
      assert.equal(await pick([visit('08')], [workers[1]]), null);
      assert.equal(await pick([visit('14')], [workers[1]]), null);
      assert.equal(await pick([visit('08'), visit('14')]), null);
      assert.equal((await pick([visit('15')], [workers[1]])).id, 2);
    });

    await t.test('requires the full service duration inside working hours', async () => {
      assert.equal(await pick([visit('15', '08:30')]), null);
      assert.equal(await pick([visit('15', '17:30')]), null);
      assert.equal((await pick([visit('15', '17:00')])).id, 1);
      assert.equal(await pick([visit('15', '17:00')], workers, 600), null);
      assert.equal(await pick([visit('15')], [{ ...workers[0], working_hours: {} }]), null);
      assert.equal(bookingDurationMinutes([
        { duration: '1 hour', qty: 2 }, { duration: '30 min' }, { addonId: 1 },
      ]), 90);
    });

    await conn.query(`INSERT INTO jobs VALUES
      (1, '2030-01-14 23:00:00', '2030-01-15 11:00:00', 'in_progress'),
      (2, '2030-01-15 10:00:00', '2030-01-15 12:00:00', 'cancelled')`);
    await t.test('detects jobs crossing midnight and ignores cancelled work', async () => {
      assert.equal((await pick([visit('15')])).id, 2);
    });

    // Reuse the connection-local tables for reassignment; no production rows
    // or messaging APIs are involved.
    await conn.query('DELETE FROM bookings');
    await conn.query('DELETE FROM booking_occurrences');
    await conn.query('DELETE FROM jobs');
    await conn.query('DELETE FROM team_member_leave');
    await conn.query(`ALTER TABLE bookings
      ADD schedule VARCHAR(20), ADD contact_city VARCHAR(100),
      ADD vendor_id INT, ADD vendor_job_id INT, ADD history JSON,
      ADD assigned_at DATETIME, ADD missed_notified_at DATETIME,
      ADD recurrence JSON, ADD PRIMARY KEY (id)`);
    await conn.query(`ALTER TABLE booking_occurrences
      ADD seq INT, ADD notified_at DATETIME, ADD missed_notified_at DATETIME,
      ADD completed_at DATETIME, MODIFY id INT AUTO_INCREMENT PRIMARY KEY,
      MODIFY status VARCHAR(20) DEFAULT 'upcoming'`);
    await conn.query('ALTER TABLE jobs ADD id INT, ADD booking_id INT');
    await conn.query(`CREATE TEMPORARY TABLE service_providers (
      id INT PRIMARY KEY, name VARCHAR(50), vendor_id INT, status VARCHAR(20),
      city VARCHAR(100), services JSON, working_hours JSON, total_jobs INT DEFAULT 0
    )`);
    await conn.query('CREATE TEMPORARY TABLE vendors (id INT PRIMARY KEY, name VARCHAR(50), status VARCHAR(20))');
    await conn.query('CREATE TEMPORARY TABLE catalog_services (name VARCHAR(100), subcategory_id INT)');
    await conn.query('CREATE TEMPORARY TABLE catalog_subcategories (id INT, name VARCHAR(100), category_id INT)');
    await conn.query('CREATE TEMPORARY TABLE catalog_categories (id INT, name VARCHAR(100))');
    await conn.query("INSERT INTO catalog_services VALUES ('Head Massage 60 min', 1)");
    await conn.query("INSERT INTO catalog_subcategories VALUES (1, 'Head Massage', 1)");
    await conn.query("INSERT INTO catalog_categories VALUES (1, 'Wellness @ Home')");
    await conn.query("INSERT INTO vendors VALUES (1, 'Vendor A', 'active'), (2, 'Vendor B', 'active'), (3, 'Paused', 'inactive')");
    await conn.query(`INSERT INTO service_providers (id, name, vendor_id, status, city, services) VALUES
      (1, 'Original', 1, 'active', 'Singapore', '["Head Massage"]'),
      (2, 'Team cover', 1, 'active', 'Singapore', '["Wellness @ Home"]'),
      (3, 'Other vendor', 2, 'active', 'Singapore', '["Head Massage"]'),
      (4, 'Wrong skill', 1, 'active', 'Singapore', '["Cleaning"]'),
      (5, 'Inactive', 1, 'inactive', 'Singapore', '["Head Massage"]'),
      (6, 'Wrong city', 1, 'active', 'Other city', '["Head Massage"]'),
      (7, 'Paused vendor', 3, 'active', 'Singapore', '["Head Massage"]'),
      (8, 'Independent', NULL, 'active', 'Singapore', '["Head Massage 60 min"]')`);
    await conn.query(`INSERT INTO bookings (id, provider_id, scheduled_at, items, status, schedule, contact_city)
      VALUES (10, 1, '2030-01-07 10:00:00', '[{"name":"Head Massage 60 min","duration":"1 hour"}]', 'upcoming', 'scheduled', 'Singapore'),
             (11, 1, '2030-01-08 10:00:00', '[{"name":"Head Massage 60 min","duration":"1 hour"}]', 'upcoming', 'recurring', 'Singapore')`);
    await conn.query(`INSERT INTO booking_occurrences (id, booking_id, provider_id, scheduled_at, status, seq, notified_at)
      VALUES (101, 11, 1, '2030-01-08 10:00:00', 'completed', 1, '2030-01-07 09:00:00'),
             (102, 11, 1, '2030-01-15 10:00:00', 'upcoming', 2, '2030-01-14 09:00:00'),
             (103, 11, 1, '2030-01-22 10:00:00', 'upcoming', 3, '2030-01-21 09:00:00')`);
    const admin = { id: 900, role: 'super_admin' };
    const owner = { id: 901, role: 'vendor_owner', vendorId: 1 };
    const change = async (bookingId, occurrenceId, providerId, actor = admin) => {
      await conn.beginTransaction();
      try {
        const result = await saveAssignment(conn, bookingId, occurrenceId, providerId, 'Staff sick', actor);
        await conn.commit();
        return result;
      } catch (error) { await conn.rollback(); throw error; }
    };
    await t.test('replacement options respect skills, city, provider and vendor status, and vendor scope', async () => {
      assert.deepEqual((await assignmentContext(conn, 10, null, admin)).providers.map(p => p.id), [1, 2, 3, 8]);
      const scoped = await assignmentContext(conn, 10, null, owner);
      assert.deepEqual(scoped.providers.map(p => p.id), [1, 2]);
      assert.equal(scoped.providers[0].available, true, 'current booking must not clash with itself');
      await assert.rejects(change(10, null, 3, owner), { status: 400 });
      await assert.rejects(change(10, null, 4), { status: 400 });
      await assert.rejects(change(10, null, 2, { ...owner, role: 'vendor_field' }), { status: 403 });
      await assert.rejects(change(10, null, 2, { ...owner, vendorId: 2 }), { status: 404 });
      await assert.rejects(change(10, null, 2, { id: 902, role: 'user' }), { status: 403 });
    });
    await t.test('rechecks leave and new conflicts when saving; failed changes retain the original assignment', async () => {
      await conn.query("INSERT INTO team_member_leave VALUES (2, '2030-01-07', '2030-01-07')");
      await assert.rejects(change(10, null, 2, owner), { status: 409 });
      await conn.query('DELETE FROM team_member_leave');
      await conn.query("INSERT INTO jobs (id, assignee_provider_id, window_start, window_end, status) VALUES (99, 2, '2030-01-07 10:00:00', '2030-01-07 11:00:00', 'assigned')");
      await assert.rejects(change(10, null, 2, owner), { status: 409 });
      const [[unchanged]] = await conn.query('SELECT provider_id, history FROM bookings WHERE id = 10');
      assert.equal(unchanged.provider_id, 1);
      assert.equal(unchanged.history, null);
      await conn.query('DELETE FROM jobs');
    });
    await t.test('vendor cover records the actor and reason, admin can then transfer across vendors', async () => {
      await change(10, null, 2, { ...owner, role: 'vendor_manager' });
      const [[saved]] = await conn.query('SELECT provider_id, history FROM bookings WHERE id = 10');
      const history = typeof saved.history === 'string' ? JSON.parse(saved.history) : saved.history;
      assert.equal(saved.provider_id, 2);
      assert.equal(history[0].actorRole, 'vendor_manager');
      assert.equal(history[0].reason, 'Staff sick');
      await change(10, null, 3);
      await assert.rejects(change(10, null, 1, owner), { status: 404 });
      await change(10, null, 8);
      assert.equal((await change(10, null, 8)).unchanged, true);
    });
    await t.test('one visit can move across vendors without changing the series owner or other visits', async () => {
      await change(11, 102, 3);
      const [[parent]] = await conn.query('SELECT provider_id FROM bookings WHERE id = 11');
      const [visits] = await conn.query('SELECT id, provider_id, notified_at FROM booking_occurrences ORDER BY id');
      assert.equal(parent.provider_id, 1);
      assert.deepEqual(visits.map(v => v.provider_id), [1, 3, 1]);
      assert.equal(visits[1].notified_at, null);
      assert.ok(visits[0].notified_at);
      assert.ok(visits[2].notified_at);
      await assert.rejects(change(11, 102, 2, owner), { status: 404 });
      await assert.rejects(change(11, null, 2, owner), { status: 404 });
      await change(11, 103, 2, owner);
    });
    await t.test('series replacement checks every remaining visit and preserves completed history', async () => {
      await conn.query("INSERT INTO team_member_leave VALUES (8, '2030-01-22', '2030-01-22')");
      await assert.rejects(change(11, null, 8), { status: 409 });
      await conn.query('DELETE FROM team_member_leave');
      await change(11, null, 8);
      const [[parent]] = await conn.query('SELECT provider_id FROM bookings WHERE id = 11');
      const [visits] = await conn.query('SELECT provider_id, notified_at FROM booking_occurrences ORDER BY id');
      assert.equal(parent.provider_id, 8);
      assert.deepEqual(visits.map(v => v.provider_id), [1, 8, 8]);
      assert.ok(visits[0].notified_at);
      assert.equal(visits[1].notified_at, null);
      assert.equal(visits[2].notified_at, null);
      await assert.rejects(change(11, 101, 2), { status: 409 });
      await assert.rejects(change(11, 999, 2), { status: 409 });
    });
    await t.test('completed, cancelled and vendor-claimed bookings cannot be reassigned', async () => {
      await conn.query("UPDATE bookings SET status = 'completed' WHERE id = 10");
      await assert.rejects(change(10, null, 2), { status: 409 });
      await conn.query("UPDATE bookings SET status = 'cancelled' WHERE id = 10");
      await assert.rejects(change(10, null, 2), { status: 409 });
      await conn.query("UPDATE bookings SET status = 'upcoming', vendor_id = 1 WHERE id = 10");
      await assert.rejects(change(10, null, 2), { status: 409 });
    });
    await t.test('only the replacement can complete its visit; top-ups inherit the new series owner', async () => {
      // Keep the public helper on our isolated connection, including its
      // transaction. Never let this test touch the configured database tables.
      const getConnection = pool.getConnection;
      const release = conn.release;
      pool.getConnection = async () => conn;
      conn.release = () => {};
      try {
        await conn.query(`UPDATE bookings SET recurrence = '{"intervalDays":7}' WHERE id = 11`);
        assert.equal(await completeNextOccurrence(11, 1), null);
        assert.equal((await completeNextOccurrence(11, 8)).id, 102);
        const [future] = await conn.query("SELECT provider_id FROM booking_occurrences WHERE booking_id = 11 AND status = 'upcoming'");
        assert.equal(future.length, 4);
        assert.ok(future.every(v => v.provider_id === 8));
        await conn.query("UPDATE bookings SET status = 'cancelled' WHERE id = 11");
        assert.equal(await completeNextOccurrence(11, 8), null);
      } finally {
        pool.getConnection = getConnection;
        conn.release = release;
      }
    });
  } finally {
    // Destroying the connection also drops every temporary fixture table.
    conn?.destroy();
    await pool.end();
  }
});
