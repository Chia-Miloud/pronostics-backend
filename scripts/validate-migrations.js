const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('TEST_DATABASE_URL ou DATABASE_URL doit être définie.');
  process.exit(1);
}

const parsedUrl = new URL(connectionString);
const configuredSslMode = parsedUrl.searchParams.get('sslmode');
parsedUrl.searchParams.delete('sslmode');
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
const ssl = configuredSslMode === 'disable' || isLocal
  ? false
  : { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true' };
const client = new Client({ connectionString: parsedUrl.toString(), ssl });

(async () => {
  const schema = `migration_test_${crypto.randomBytes(5).toString('hex')}`;
  const migrationDirectory = path.resolve(__dirname, '../src/migrations');
  const files = fs.readdirSync(migrationDirectory)
    .filter(filename => /^\d+.*\.sql$/.test(filename))
    .sort();

  await client.connect();
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}`);

  for (const filename of files) {
    await client.query(fs.readFileSync(path.join(migrationDirectory, filename), 'utf8'));
  }

  const result = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
    [schema]
  );
  const present = new Set(result.rows.map(row => row.table_name));
  const required = [
    'articles', 'competitions', 'conversion_events', 'matches', 'page_views',
    'prediction_accesses', 'pronostics', 'retention_emails', 'users'
  ];
  const missing = required.filter(table => !present.has(table));
  if (missing.length > 0) throw new Error(`Tables manquantes : ${missing.join(', ')}`);

  await client.query('ROLLBACK');
  await client.end();
  console.log(`Migrations validées : ${files.join(', ')}`);
})().catch(async error => {
  try { await client.query('ROLLBACK'); } catch {}
  try { await client.end(); } catch {}
  console.error(`Échec des migrations : ${error.message}`);
  process.exit(1);
});
