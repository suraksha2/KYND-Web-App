/**
 * Production seed: default admin / superadmin login.
 *
 * Creates (or updates) a single `super_admin` user. Both the admin and
 * superadmin consoles accept `super_admin`, and the users.email column is
 * UNIQUE, so one row is enough.
 *
 * DB credentials come from the repo-root `.env` (Docker Compose env file).
 * From the host that means 127.0.0.1 + MYSQL_HOST_PORT. Inside the backend
 * container, compose already sets MYSQL_HOST=mysql.
 *
 *   cd backend/db
 *   npm run seed:admins
 *
 * Or against a running stack:
 *   docker compose --env-file .env exec backend npx tsx scripts/seed-production-admins.ts
 *
 * Idempotent — safe to re-run; resets password and role on conflict.
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const dbRoot = path.join(__dirname, '..');
const repoRoot = path.join(dbRoot, '..', '..');
const envPath = path.join(repoRoot, '.env');

if (!fs.existsSync(envPath)) {
  console.error(`[seed:admins] Missing ${envPath}`);
  console.error('[seed:admins] Create a root .env with MYSQL_USER / MYSQL_PASSWORD first.');
  process.exit(1);
}

// Do not override vars already set (e.g. compose env inside the backend container).
dotenv.config({ path: envPath });

const EMAIL = 'manish.inncelerator@gmail.com';
const PASSWORD = 'Manish11@';
const NAME = 'Manish';
const ROLE = 'super_admin';

async function main() {
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE || 'urban_service';

  if (!user || !password) {
    throw new Error('MYSQL_USER and MYSQL_PASSWORD are required in .env');
  }

  // Host runs talk to the published MySQL port; in-compose runs use MYSQL_HOST=mysql.
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || process.env.MYSQL_HOST_PORT || 3307);

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 2,
  });

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         password_hash = VALUES(password_hash),
         role = VALUES(role),
         status = 'active'`,
      [NAME, EMAIL, passwordHash, ROLE]
    );

    const info = result as mysql.ResultSetHeader;
    const action = info.affectedRows === 1 ? 'created' : 'updated';

    console.log(`[seed:admins] connected ${user}@${host}:${port}/${database}`);
    console.log(`[seed:admins] ${action} ${ROLE}: ${EMAIL}`);
    console.log(`[seed:admins] Works for both /admin and /superadmin login.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed:admins] Failed:', err.message || err);
  process.exit(1);
});
