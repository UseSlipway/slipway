CREATE TABLE IF NOT EXISTS pons_progress_cache (
  token_address TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pons_progress_cache_fetched_at_idx
  ON pons_progress_cache (fetched_at ASC);
