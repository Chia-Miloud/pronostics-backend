const fs = require('fs');
const path = require('path');

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = fs.readdirSync(__dirname)
    .filter(filename => /^\d+.*\.sql$/.test(filename))
    .sort();

  for (const filename of files) {
    const alreadyApplied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename]
    );
    if (alreadyApplied.rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(__dirname, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename]
      );
      await client.query('COMMIT');
      console.log(`✅ Migration appliquée : ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${filename} échouée : ${error.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { runMigrations };
