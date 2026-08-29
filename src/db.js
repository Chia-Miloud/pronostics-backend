const { Pool } = require('pg');
const { databaseUrl, pgSslRejectUnauthorized } = require('./config/env');
const { runMigrations } = require('./migrations');

const parsedDatabaseUrl = new URL(databaseUrl);
const configuredSslMode = parsedDatabaseUrl.searchParams.get('sslmode');
parsedDatabaseUrl.searchParams.delete('sslmode');
parsedDatabaseUrl.searchParams.delete('sslrootcert');

const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname);
const sslEnabled = process.env.PG_SSL === 'true'
  || (process.env.PG_SSL !== 'false' && configuredSslMode !== 'disable' && !isLocalDatabase);

const pool = new Pool({
  connectionString: parsedDatabaseUrl.toString(),
  ssl: sslEnabled ? { rejectUnauthorized: pgSslRejectUnauthorized } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const query = (text, params) => pool.query(text, params);

const initDB = async () => {
  await runMigrations(pool);
  console.log('✅ Base de données initialisée et migrations vérifiées');
};

module.exports = { query, pool, initDB };
