CREATE INDEX IF NOT EXISTS idx_pronostics_external_match_id
  ON pronostics(external_match_id);

CREATE INDEX IF NOT EXISTS idx_pronostics_match_user_created
  ON pronostics(match_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pronostics_external_user_created
  ON pronostics(external_match_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pronostics_generic_created
  ON pronostics(created_at)
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pv_created
  ON page_views(created_at);

CREATE INDEX IF NOT EXISTS idx_pv_page
  ON page_views(page);

CREATE INDEX IF NOT EXISTS idx_pv_session
  ON page_views(session_id);

CREATE INDEX IF NOT EXISTS idx_re_type
  ON retention_emails(type);

CREATE INDEX IF NOT EXISTS idx_re_user
  ON retention_emails(user_id);

CREATE INDEX IF NOT EXISTS idx_matches_date_status
  ON matches(date_heure, statut);
