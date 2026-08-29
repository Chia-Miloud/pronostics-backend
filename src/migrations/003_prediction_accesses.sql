CREATE TABLE IF NOT EXISTS prediction_accesses (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_key TEXT NOT NULL,
  access_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prediction_accesses_user_match_day_key
    UNIQUE (user_id, match_key, access_date)
);

CREATE INDEX IF NOT EXISTS idx_prediction_accesses_user_date
  ON prediction_accesses(user_id, access_date);
