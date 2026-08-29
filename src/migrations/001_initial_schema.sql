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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  nb_logins INTEGER DEFAULT 0,
  attribution JSONB
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS prenom TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nom TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nb_logins INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS attribution JSONB;

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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  competition_id INTEGER,
  competition_logo TEXT
);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS logo1 TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS logo2 TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition TEXT DEFAULT 'Coupe du Monde 2026';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'SCHEDULED';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_p1 INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_p2 INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition_id INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition_logo TEXT;

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  buteurs JSONB,
  cotes JSONB,
  external_match_id TEXT
);

ALTER TABLE pronostics ADD COLUMN IF NOT EXISTS external_match_id TEXT;
ALTER TABLE pronostics ADD COLUMN IF NOT EXISTS buteurs JSONB;
ALTER TABLE pronostics ADD COLUMN IF NOT EXISTS cotes JSONB;

CREATE TABLE IF NOT EXISTS competitions (
  id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'football',
  pays TEXT,
  logo TEXT,
  actif BOOLEAN DEFAULT TRUE,
  ordre INTEGER DEFAULT 99,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversion_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  stripe_session_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS page_views (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  page TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  country TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  attribution JSONB
);

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS attribution JSONB;

CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  titre TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  resume TEXT,
  contenu TEXT NOT NULL,
  categorie TEXT DEFAULT 'analyse',
  tags TEXT[],
  image_url TEXT,
  auteur TEXT DEFAULT 'IA Coach',
  publie BOOLEAN DEFAULT FALSE,
  vues INTEGER DEFAULT 0,
  social_fb TEXT,
  social_insta TEXT,
  social_tiktok TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS retention_emails (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  email TEXT NOT NULL,
  type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent'
);
