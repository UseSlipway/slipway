CREATE TABLE IF NOT EXISTS api_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_number BIGINT NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_hash)
);

CREATE INDEX IF NOT EXISTS api_rate_limits_updated_at_idx ON api_rate_limits (updated_at);
