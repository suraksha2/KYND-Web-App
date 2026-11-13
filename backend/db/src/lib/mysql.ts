import mysql from 'mysql2/promise';

// In development, `tsx watch` re-evaluates this module on every change.
// Creating a new pool each time leaks connections until MySQL hits
// max_connections and every query fails with "Too many connections".
// Cache a single pool on globalThis so hot reloads reuse it, but recreate it
// if the config changes (e.g. dateStrings toggle) so edits actually take effect.
type MysqlCache = {
  pool?: mysql.Pool;
  configKey?: string;
};
const globalForMysql = globalThis as unknown as { __mysql?: MysqlCache };
if (!globalForMysql.__mysql) globalForMysql.__mysql = {};

function resolveMysqlPassword(): string {
  const fromEnv = process.env.MYSQL_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    if (!fromEnv?.trim() || /^(change[_ -]?me|changeme|password|root123)/i.test(fromEnv)) {
      throw new Error('A non-placeholder MYSQL_PASSWORD is required in production.');
    }
    return fromEnv;
  }
  if (fromEnv) return fromEnv;
  // Dev-only fallback so local `npm run dev` still works without a .env.
  console.warn('[mysql] MYSQL_PASSWORD unset; using insecure local default. Do not use in production.');
  return 'root123';
}

function mysqlSetting(name: string, localDefault: string): string {
  const value = process.env[name]?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!value) throw new Error(`${name} environment variable is required in production.`);
    return value;
  }
  return value || localDefault;
}

function resolveMysqlPort(): number {
  const rawPort = process.env.MYSQL_PORT?.trim();
  if (!rawPort) return 3306;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

const poolConfig = {
  host: mysqlSetting('MYSQL_HOST', 'localhost'),
  port: resolveMysqlPort(),
  user: mysqlSetting('MYSQL_USER', 'root'),
  password: resolveMysqlPassword(),
  database: mysqlSetting('MYSQL_DATABASE', 'urban_service'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // The app stores and displays all dates as SGT wall-clock. Return DATETIME
  // columns as strings so mysql2 does not reinterpret them in the process
  // timezone, and pin every connection to +08:00 so MySQL's CURRENT_TIMESTAMP,
  // NOW() and ON UPDATE CURRENT_TIMESTAMP produce SGT values.
  dateStrings: true,
};

if (process.env.NODE_ENV === 'production' && poolConfig.user.toLowerCase() === 'root') {
  throw new Error('MYSQL_USER must be a non-root account in production.');
}

const configKey = JSON.stringify(poolConfig);
let pool: mysql.Pool;
if (globalForMysql.__mysql.pool && globalForMysql.__mysql.configKey === configKey) {
  pool = globalForMysql.__mysql.pool;
} else {
  if (globalForMysql.__mysql.pool) {
    try {
      globalForMysql.__mysql.pool.end();
    } catch { /* empty */ }
  }
  pool = mysql.createPool(poolConfig);
  pool.on('connection', (connection) => {
    connection.query('SET time_zone = "+08:00"');
  });
  globalForMysql.__mysql = { pool, configKey };
}

export default pool;
