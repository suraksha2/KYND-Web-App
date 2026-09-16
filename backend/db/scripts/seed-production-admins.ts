/**
 * Production seed: default admin / superadmin login.
 *
 * Creates (or updates) a single `super_admin` user. Both the admin and
 * superadmin consoles accept `super_admin`, and the users.email column is
 * UNIQUE, so one row is enough.
 *
 *   cd backend/db
 *   npm run seed:admins
 *
 * Requires MYSQL_* env (loads .env.local then .env from backend/db).
 * Idempotent — safe to re-run; resets password and role on conflict.
 */
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const projectRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const EMAIL = 'manish.inncelerator@gmail.com';
const PASSWORD = 'Manish11@';
const NAME = 'Manish';
const ROLE = 'super_admin';

async function main() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root123',
    database: process.env.MYSQL_DATABASE || 'urban_service',
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
