/**
 * Production seed: default admin / superadmin login.
 *
 * Creates (or updates) a single `super_admin` user.
 *
 * DB credentials:
 *   - Inside Docker: compose already sets MYSQL_* (MYSQL_HOST=mysql).
 *   - On the host: loads repo-root `.env`, connects to 127.0.0.1:MYSQL_HOST_PORT.
 *
 * Host:
 *   cd backend/db && npm run seed:admins
 *
 * Docker (after rebuild so scripts/ is in the image):
 *   docker compose --env-file .env exec backend node scripts/seed-production-admins.mjs
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoEnvPath = join(__dirname, '..', '..', '..', '.env');

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return false;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}

// Host runs: fill from repo-root .env. Container runs: compose env already set.
loadEnvFile(repoEnvPath);

const EMAIL = 'manish.inncelerator@gmail.com';
const PASSWORD = 'Manish11@';
const NAME = 'Manish';
const ROLE = 'super_admin';

async function main() {
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE || 'urban_service';

  if (!user || !password) {
    throw new Error(
      'MYSQL_USER and MYSQL_PASSWORD required (set in root .env or compose env)'
    );
  }

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

    const info = result;
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
