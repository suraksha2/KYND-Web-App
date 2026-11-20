// node scripts/migrate.mjs [--status] [--baseline]
// Applies migrations/*.sql in filename order, once each, tracked in schema_migrations.
//   --status    list applied/pending, change nothing
//   --baseline  record every file as applied WITHOUT running it (existing DBs
//               already built from db.sql / earlier manual runs)
// Run from backend/db after db.sql has been imported. Connects with MYSQL_* env vars.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const dir = new URL('../migrations/', import.meta.url);
const status = process.argv.includes('--status');
const baseline = process.argv.includes('--baseline');
const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE || 'urban_service',
  multipleStatements: true,
});

try {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const [rows] = await db.query('SELECT name, checksum FROM schema_migrations');
  const done = new Map(rows.map((r) => [r.name, r.checksum]));
  let ran = 0;
  for (const name of files) {
    const sql = await fs.readFile(new URL(name, dir), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    if (done.has(name)) {
      if (done.get(name) !== checksum) console.warn(`! ${name} changed since it was applied`);
      if (status) console.log(`  applied  ${name}`);
      continue;
    }
    if (status) { console.log(`  pending  ${name}`); continue; }
    if (!baseline) {
      console.log(`> applying ${name}`);
      await db.query(sql);
    }
    await db.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [name, checksum]);
    ran++;
  }
  if (!status) console.log(`${baseline ? 'Baselined' : 'Applied'} ${ran} migration(s).`);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
