CREATE TABLE IF NOT EXISTS market_response_cache (
  cache_key TEXT PRIMARY KEY,
  status_code INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  body TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_response_cache_fetched_at_idx
  ON market_response_cache (fetched_at ASC);
