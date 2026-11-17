// Seed/create an admin user with a bcrypt-hashed password.
//
// Usage:
//   ADMIN_BOOTSTRAP_PASSWORD=... node scripts/create-admin.mjs <email> [name] [role]
// DB connection is read from env vars (falls back to the same defaults as src/lib/mysql.ts).

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
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
const name = process.env.ADMIN_BOOTSTRAP_NAME || process.argv[3] || 'Admin';
const role = process.env.ADMIN_BOOTSTRAP_ROLE || process.argv[4] || 'super_admin';

async function main() {
  if (!email || password.length < 12) {
    throw new Error('Set ADMIN_BOOTSTRAP_PASSWORD (12+ characters) and provide an email.');
  }

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
    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (Array.isArray(existing) && existing.length > 0) {
      await pool.query(
        'UPDATE users SET name = ?, password_hash = ?, role = ?, status = ? WHERE email = ?',
        [name, passwordHash, role, 'active', email]
      );
      console.log(`Updated existing user "${email}" -> role=${role}, status=active`);
    } else {
      await pool.query(
        'INSERT INTO users (name, email, password_hash, role, status, joined) VALUES (?, ?, ?, ?, ?, CURDATE())',
        [name, email, passwordHash, role, 'active']
      );
      console.log(`Created admin user "${email}" with role=${role}`);
    }

    console.log('Admin bootstrap complete. Sign in through the admin portal.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
