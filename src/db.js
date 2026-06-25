const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('postgresql') ? { rejectUnauthorized: false } : false,
});

const query = (text, params) => pool.query(text, params);

const initDB = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      pseudo TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      prenom TEXT,
      nom TEXT,
      telephone TEXT,
      plan TEXT DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      external_id TEXT UNIQUE,
      equipe1 TEXT NOT NULL,
      equipe2 TEXT NOT NULL,
      logo1 TEXT,
      logo2 TEXT,
      date_heure TIMESTAMPTZ NOT NULL,
      phase TEXT,
      competition TEXT DEFAULT 'Coupe du Monde 2026',
      statut TEXT DEFAULT 'SCHEDULED',
      score_p1 INTEGER,
      score_p2 INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS pronostics (
      id SERIAL PRIMARY KEY,
      match_id INTEGER REFERENCES matches(id),
      user_id INTEGER REFERENCES users(id),
      favori TEXT,
      score_confiance INTEGER,
      niveau_confiance TEXT,
      prob_p1 INTEGER,
      prob_nul INTEGER,
      prob_p2 INTEGER,
      score_exact TEXT,
      analyse_texte TEXT,
      raisons JSONB,
      trap_score INTEGER,
      trap_raison TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log('✅ Base de données initialisée');
};

module.exports = { query, pool, initDB };
