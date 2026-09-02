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

const poolConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'root123',
  database: process.env.MYSQL_DATABASE || 'urban_service',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // The app stores and displays all dates as SGT wall-clock. Return DATETIME
  // columns as strings so mysql2 does not reinterpret them in the process
  // timezone, and pin every connection to +08:00 so MySQL's CURRENT_TIMESTAMP,
  // NOW() and ON UPDATE CURRENT_TIMESTAMP produce SGT values.
  dateStrings: true,
};

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
