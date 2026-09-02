import mysql from 'mysql2/promise';

// In development, `tsx watch` re-evaluates this module on every change.
// Creating a new pool each time leaks connections until MySQL hits
// max_connections and every query fails with "Too many connections".
// Cache a single pool on globalThis so hot reloads reuse it.
const globalForMysql = globalThis as unknown as {
  mysqlPool?: mysql.Pool;
};

const pool =
  globalForMysql.mysqlPool ??
  mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root123',
    database: process.env.MYSQL_DATABASE || 'urban_service',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForMysql.mysqlPool = pool;
}

export default pool;
