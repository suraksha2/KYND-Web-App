// Ensure the service_providers.password_hash column exists and (optionally) set
// a provider's login password so they can sign in to the provider portal.
//
// Usage:
//   node scripts/set-provider-password.mjs <email> <password>
//
// If only the column migration is needed, run without arguments:
//   node scripts/set-provider-password.mjs
//
// DB connection is read from env vars (falls back to the same defaults as
// src/lib/mysql.ts).

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load .env.local manually (no dotenv dependency required).
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // No .env.local; rely on process env / defaults.
}

const email = (process.argv[2] || '').trim().toLowerCase();
const password = process.argv[3] || '';

async function main() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root123',
    database: process.env.MYSQL_DATABASE || 'urban_service',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  try {
    // 1. Add the password_hash column if it does not already exist.
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'service_providers'
         AND COLUMN_NAME = 'password_hash'`
    );
    if (!Array.isArray(cols) || cols.length === 0) {
      await pool.query(
        'ALTER TABLE service_providers ADD COLUMN password_hash VARCHAR(255) AFTER email'
      );
      console.log('Added service_providers.password_hash column.');
    } else {
      console.log('Column service_providers.password_hash already exists.');
    }

    // 2. Optionally set a provider password.
    if (email && password) {
      const [existing] = await pool.query(
        'SELECT id FROM service_providers WHERE email = ?',
        [email]
      );
      if (!Array.isArray(existing) || existing.length === 0) {
        console.error(`No service provider found with email "${email}".`);
        process.exit(1);
      }
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE service_providers SET password_hash = ? WHERE email = ?',
        [passwordHash, email]
      );
      console.log(`Set password for provider "${email}".`);
      console.log('The provider can now sign in to the provider portal.');
    } else {
      console.log('No email/password provided — ran migration only.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
