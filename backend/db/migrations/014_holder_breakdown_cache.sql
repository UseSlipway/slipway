CREATE TABLE IF NOT EXISTS holder_breakdown_cache (
  chain TEXT NOT NULL,
  token_address TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, token_address)
);

CREATE INDEX IF NOT EXISTS holder_breakdown_cache_fetched_at_idx
  ON holder_breakdown_cache (fetched_at ASC);
