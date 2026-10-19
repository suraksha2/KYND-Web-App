// Seed a demo vendor (Partner OS) account with a team, today's jobs, an open
// offer, a pending payout and an expiring cert, so the vendor portal Home
// screen has something to show locally. Not part of db.sql — that file is
// schema-only; this is throwaway local/demo data, safe to run more than once.
//
// Usage:
//   node scripts/seed-vendor-demo.mjs [ownerEmail] [password]
//
// Defaults: owner@limhome.sg / vendor@123

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = join(__dirname, '..', '.env.local');
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // No .env.local; rely on process env / defaults.
}

const ownerEmail = (process.argv[2] || 'owner@limhome.sg').trim().toLowerCase();
const ownerPassword = process.argv[3] || 'vendor@123';

// DATETIME columns hold Singapore wall-clock time regardless of where this
// script runs, so format every date against the Asia/Singapore timezone
// rather than `Date#toISOString()` (which would silently shift by the
// local<->SGT offset on any machine not already in +08:00).
function sgtDateTime(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function sgtDate(date) {
  return sgtDateTime(date).slice(0, 10);
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root123',
    database: process.env.MYSQL_DATABASE || 'urban_service',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    dateStrings: true,
  });

  try {
    // 1. Vendor
    const vendorName = 'Lim & Co Home Services';
    const [existingVendor] = await pool.query('SELECT id FROM vendors WHERE contact_email = ?', [ownerEmail]);
    let vendorId;
    if (existingVendor.length > 0) {
      vendorId = existingVendor[0].id;
      await pool.query(
        'UPDATE vendors SET name = ?, categories = ?, city = ?, status = ? WHERE id = ?',
        [vendorName, JSON.stringify(['Home Cleaning', 'Home Move-Out Cleaning']), 'Singapore', 'active', vendorId]
      );
    } else {
      const [result] = await pool.query(
        'INSERT INTO vendors (name, contact_email, mobile, city, categories, status) VALUES (?, ?, ?, ?, ?, ?)',
        [vendorName, ownerEmail, '+6591234567', 'Singapore', JSON.stringify(['Home Cleaning', 'Home Move-Out Cleaning']), 'active']
      );
      vendorId = result.insertId;
    }
    console.log(`Vendor "${vendorName}" -> id=${vendorId}`);

    // 2. Owner seat
    const passwordHash = await bcrypt.hash(ownerPassword, 10);
    const [existingOwner] = await pool.query('SELECT id FROM vendor_users WHERE email = ?', [ownerEmail]);
    if (existingOwner.length > 0) {
      await pool.query(
        'UPDATE vendor_users SET name = ?, password_hash = ?, role = ?, status = ?, vendor_id = ? WHERE email = ?',
        ['Daniel Lim', passwordHash, 'owner', 'active', vendorId, ownerEmail]
      );
    } else {
      await pool.query(
        'INSERT INTO vendor_users (vendor_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [vendorId, 'Daniel Lim', ownerEmail, passwordHash, 'owner', 'active']
      );
    }
    console.log(`Owner seat ready: ${ownerEmail} / ${ownerPassword}`);

    // 3. Team (service_providers rows owned by this vendor)
    const team = [
      { name: 'Siti Rahman', mobile: '+6591111111', email: `sr.${vendorId}@limhome.demo` },
      { name: 'Ho Keat', mobile: '+6591111112', email: `hk.${vendorId}@limhome.demo` },
      { name: 'Rizal Hakim', mobile: '+6591111113', email: `rh.${vendorId}@limhome.demo` },
      { name: 'Grace Ong', mobile: '+6591111114', email: `go.${vendorId}@limhome.demo` },
      { name: 'Arjun Pillai', mobile: '+6591111115', email: `ap.${vendorId}@limhome.demo` },
    ];
    const teamIds = {};
    for (const member of team) {
      const [existing] = await pool.query('SELECT id FROM service_providers WHERE email = ?', [member.email]);
      if (existing.length > 0) {
        await pool.query('UPDATE service_providers SET vendor_id = ?, status = ? WHERE id = ?', [vendorId, 'active', existing[0].id]);
        teamIds[member.name] = existing[0].id;
      } else {
        const [result] = await pool.query(
          `INSERT INTO service_providers (vendor_id, name, email, mobile, services, city, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [vendorId, member.name, member.email, member.mobile, JSON.stringify(['Home Cleaning']), 'Singapore', 'active']
        );
        teamIds[member.name] = result.insertId;
      }
    }
    console.log(`Team ready: ${Object.keys(teamIds).join(', ')}`);

    // Clear out this vendor's previous demo jobs/offers so the script is
    // re-runnable without piling up duplicates.
    await pool.query('DELETE FROM jobs WHERE vendor_id = ?', [vendorId]);
    await pool.query('DELETE FROM offers WHERE vendor_id = ?', [vendorId]);
    await pool.query('DELETE FROM vendor_payouts WHERE vendor_id = ?', [vendorId]);

    // 4. Today's jobs
    const pad = (n) => String(n).padStart(2, '0');
    const today = (h, m = 0) => `${sgtDate(new Date())} ${pad(h)}:${pad(m)}:00`;
    const onDay = (offsetDays, h, m = 0) => `${sgtDate(new Date(Date.now() + offsetDays * 86400000))} ${pad(h)}:${pad(m)}:00`;
    // Last Mon–Sun week — the period the seeded pending payout covers.
    const dayMs = 86400000;
    const mondayOffset = (new Date().getDay() + 6) % 7; // 0 = Monday
    const prevMonday = new Date(Date.now() - (mondayOffset + 7) * dayMs);
    const payoutDay = (offsetDays, h, m = 0) => `${sgtDate(new Date(prevMonday.getTime() + offsetDays * dayMs))} ${pad(h)}:${pad(m)}:00`;
    const addHours = (dateStr, hours) => {
      const d = new Date(dateStr.replace(' ', 'T') + '+08:00');
      d.setTime(d.getTime() + hours * 3600000);
      return sgtDateTime(d);
    };
    const minutesAgo = (mins) => sgtDateTime(new Date(Date.now() - mins * 60000));

    const jobs = [
      // Assigned-but-not-started, window already passed -> triggers the
      // "running late" needs-attention alert regardless of when this is run.
      { customer_name: 'Lena Koh', customer_area: 'Toa Payoh', service_label: 'Standard home clean', source: 'kynd', status: 'assigned', start: minutesAgo(25), hours: 3, assignee: teamIds['Rizal Hakim'], gross: 120, net: 102, exactStart: true },
      { customer_name: 'Mrs Tan Wei Ling', customer_area: 'Bishan', service_label: 'Standard home clean', source: 'kynd', status: 'in_progress', start: today(8, 30), hours: 3, assignee: teamIds['Siti Rahman'], gross: 120, net: 102 },
      { customer_name: 'Ho Kee Coffee Shop', customer_area: 'Bedok North', service_label: 'Cockroach treatment', source: 'own', status: 'completed', start: today(0, 0), hours: 1, assignee: teamIds['Ho Keat'], gross: 90, net: 90, completed: true },
      { customer_name: 'Aisha Rahman', customer_area: 'Serangoon', service_label: 'Deep clean', source: 'kynd', status: 'assigned', start: today(10, 0), hours: 4, assignee: teamIds['Rizal Hakim'], gross: 220, net: 187 },
      { customer_name: 'Chloe Ng', customer_area: 'Tampines', service_label: 'Standard home clean', source: 'kynd', status: 'assigned', start: today(11, 0), hours: 3, assignee: teamIds['Ho Keat'], gross: 120, net: 102 },
      { customer_name: 'Mr and Mrs Varghese', customer_area: 'Bukit Merah', service_label: 'Move-out clean', source: 'kynd', status: 'assigned', start: today(12, 0), hours: 5, assignee: teamIds['Grace Ong'], gross: 300, net: 255 },
      { customer_name: 'Studio Ferro Pte Ltd', customer_area: 'Tanjong Pagar', service_label: 'Office clean', source: 'own', status: 'assigned', start: today(13, 0), hours: 2, assignee: teamIds['Siti Rahman'], gross: 160, net: 160 },
      { customer_name: 'Ramesh Kumar', customer_area: 'Kembangan', service_label: 'General pest treatment', source: 'kynd', status: 'assigned', start: today(13, 0), hours: 1.5, assignee: teamIds['Arjun Pillai'], gross: 130, net: 110 },
      { customer_name: 'Mrs Goh', customer_area: 'Clementi', service_label: 'Termite inspection', source: 'kynd', status: 'accepted', start: today(15, 30), hours: 1, assignee: null, gross: 100, net: 85 },

      // Past + future rows so the Jobs list has Completed history and
      // upcoming work beyond today (including an unassigned future job).
      { customer_name: 'Weaver & Co', customer_area: 'Raffles Place', service_label: 'Office clean', source: 'own', status: 'completed', start: onDay(-1, 9), hours: 2, assignee: teamIds['Siti Rahman'], gross: 180, net: 180, completed: true },
      { customer_name: 'Mr Fernando', customer_area: 'Pasir Ris', service_label: 'Move-out clean', source: 'kynd', status: 'completed', start: onDay(-2, 10), hours: 5, assignee: teamIds['Grace Ong'], gross: 320, net: 272, completed: true },

      // Completed Kynd jobs inside last Mon–Sun week — these get stamped
      // with the seeded payout's payout_id so the statement has members.
      { customer_name: 'Mehta Family', customer_area: 'Punggol', service_label: 'Deep clean', source: 'kynd', status: 'completed', start: payoutDay(1, 10), hours: 4, assignee: teamIds['Grace Ong'], gross: 240, net: 204, completed: true },
      { customer_name: 'Kwok Residence', customer_area: 'Sengkang', service_label: 'Standard home clean', source: 'kynd', status: 'completed', start: payoutDay(3, 9), hours: 3, assignee: teamIds['Siti Rahman'], gross: 120, net: 102, completed: true },
      { customer_name: 'Priyanka S', customer_area: 'Clementi', service_label: 'Bed bug treatment', source: 'kynd', status: 'accepted', start: onDay(2, 9), hours: 1.5, assignee: null, gross: 150, net: 128 },
      { customer_name: 'Kopi Corner', customer_area: 'Jurong East', service_label: 'Monthly pest service', source: 'own', status: 'assigned', start: onDay(3, 10), hours: 1.5, assignee: teamIds['Arjun Pillai'], gross: 160, net: 160 },
    ];

    for (const j of jobs) {
      const windowEnd = addHours(j.start, j.hours);
      await pool.query(
        `INSERT INTO jobs (vendor_id, source, status, assignee_provider_id, customer_name, customer_area,
                            service_label, category, window_start, window_end, gross, fee_pct, net,
                            started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vendorId, j.source, j.status, j.assignee, j.customer_name, j.customer_area,
          j.service_label, /pest|termite|cockroach|bug|ant/i.test(j.service_label) ? 'Pest Control' : 'Cleaning',
          j.start, windowEnd, j.gross, j.source === 'own' ? 0 : 15, j.net,
          j.status === 'in_progress' || j.completed ? j.start : null,
          j.completed ? j.start : null,
        ]
      );
    }
    console.log(`Seeded ${jobs.length} jobs for today.`);

    // 5. Offers: one still open (long enough to click around the inbox), plus
    // a few expired ones so the "Closed" history isn't empty.
    const soon = sgtDateTime(new Date(Date.now() + 2 * 3600000));
    const expires = sgtDateTime(new Date(Date.now() + 50 * 60000));
    await pool.query(
      `INSERT INTO offers (vendor_id, service_label, category, area, window_start, window_end, price, fee_pct, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [vendorId, 'Standard home clean', 'Home Cleaning', 'Ang Mo Kio', soon, addHours(soon, 3), 140, 15, expires]
    );
    const daysAgo = (d, h, m = 0) => `${sgtDate(new Date(Date.now() - d * 86400000))} ${pad(h)}:${pad(m)}:00`;
    const closedOffers = [
      { label: 'Deep clean', category: 'Home Cleaning', area: 'Tampines', start: daysAgo(2, 9), hours: 4, price: 210 },
      { label: 'Standard home clean', category: 'Home Cleaning', area: 'Punggol', start: daysAgo(1, 14), hours: 3, price: 140 },
      { label: 'Ant treatment', category: 'Pest Control', area: 'Jurong West', start: daysAgo(1, 10), hours: 1, price: 90 },
    ];
    for (const o of closedOffers) {
      await pool.query(
        `INSERT INTO offers (vendor_id, service_label, category, area, window_start, window_end, price, fee_pct, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 15, 'expired', ?)`,
        [vendorId, o.label, o.category, o.area, o.start, addHours(o.start, o.hours), o.price, o.start]
      );
    }
    console.log(`Seeded 1 open offer + ${closedOffers.length} expired offers.`);

    // 6. A pending payout for last Mon–Sun week with its member jobs stamped —
    // mirrors what the real payout batch produces (src/lib/payouts.ts): jobs
    // carry payout_id and the row's totals are recomputed from them.
    const payoutStart = sgtDate(prevMonday);
    const payoutEnd = sgtDate(new Date(prevMonday.getTime() + 6 * dayMs));
    const [payoutRes] = await pool.query(
      `INSERT INTO vendor_payouts (vendor_id, period_start, period_end, status)
       VALUES (?, ?, ?, 'pending')`,
      [vendorId, payoutStart, payoutEnd]
    );
    await pool.query(
      `UPDATE jobs SET payout_id = ?
        WHERE vendor_id = ? AND source = 'kynd' AND status = 'completed'
          AND completed_at IS NOT NULL AND DATE(completed_at) BETWEEN ? AND ?`,
      [payoutRes.insertId, vendorId, payoutStart, payoutEnd]
    );
    await pool.query(
      `UPDATE vendor_payouts p SET
         p.jobs  = (SELECT COUNT(*) FROM jobs j WHERE j.payout_id = p.id),
         p.gross = (SELECT COALESCE(SUM(j.gross), 0) FROM jobs j WHERE j.payout_id = p.id),
         p.net   = (SELECT COALESCE(SUM(j.net), 0) FROM jobs j WHERE j.payout_id = p.id),
         p.fee   = (SELECT COALESCE(SUM(j.gross - j.net), 0) FROM jobs j WHERE j.payout_id = p.id)
       WHERE p.id = ?`,
      [payoutRes.insertId]
    );
    console.log('Seeded 1 pending payout with member jobs.');

    // A 'scheduled' accrual row for the current open week, when it has
    // completed Kynd work — the same shape the batch run produces.
    const thisMonday = new Date(prevMonday.getTime() + 7 * dayMs);
    const thisSunday = new Date(thisMonday.getTime() + 6 * dayMs);
    const [wkSums] = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(gross), 0) AS gross,
              COALESCE(SUM(gross - net), 0) AS fee, COALESCE(SUM(net), 0) AS net
         FROM jobs
        WHERE vendor_id = ? AND source = 'kynd' AND status = 'completed' AND payout_id IS NULL
          AND completed_at IS NOT NULL AND DATE(completed_at) BETWEEN ? AND ?`,
      [vendorId, sgtDate(thisMonday), sgtDate(thisSunday)]
    );
    if (Number(wkSums[0].cnt) > 0) {
      await pool.query(
        `INSERT INTO vendor_payouts (vendor_id, period_start, period_end, jobs, gross, fee, net, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
        [vendorId, sgtDate(thisMonday), sgtDate(thisSunday), wkSums[0].cnt, wkSums[0].gross, wkSums[0].fee, wkSums[0].net]
      );
      console.log('Seeded 1 scheduled accrual payout.');
    }

    // 7. An expiring cert for Grace Ong
    await pool.query('DELETE FROM team_member_certs WHERE provider_id = ?', [teamIds['Grace Ong']]);
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    await pool.query(
      'INSERT INTO team_member_certs (provider_id, name, issued_at, expires_at) VALUES (?, ?, CURDATE(), ?)',
      [teamIds['Grace Ong'], 'Kynd training', sgtDate(expiresAt)]
    );
    console.log('Seeded 1 expiring cert (Grace Ong).');

    // 8. Leave for Siti this weekend — exercises the schedule's "On leave"
    //    blocks and the assign pickers' warnings.
    await pool.query('DELETE FROM team_member_leave WHERE vendor_id = ?', [vendorId]);
    const leaveStart = sgtDate(new Date(Date.now() + 1 * dayMs));
    const leaveEnd = sgtDate(new Date(Date.now() + 2 * dayMs));
    await pool.query(
      'INSERT INTO team_member_leave (vendor_id, provider_id, start_date, end_date, note) VALUES (?, ?, ?, ?, ?)',
      [vendorId, teamIds['Siti Rahman'], leaveStart, leaveEnd, 'Family trip']
    );
    console.log('Seeded 1 leave entry (Siti Rahman).');

    console.log('\nDone. Sign in to the vendor portal with:');
    console.log(`  email:    ${ownerEmail}`);
    console.log(`  password: ${ownerPassword}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed to seed vendor demo data:', err);
  process.exit(1);
});
