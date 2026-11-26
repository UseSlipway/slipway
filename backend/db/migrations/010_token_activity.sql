-- Anonymous, aggregate token activity for the "Trending on Slipway" ranking.
-- Only chain, token, a 10-minute bucket and counters are stored: no wallets, amounts or IPs.
CREATE TABLE IF NOT EXISTS token_activity (
  chain TEXT NOT NULL CHECK (chain IN ('rhc', 'base')),
  token_address TEXT NOT NULL,
  bucket TIMESTAMPTZ NOT NULL,
  quotes INTEGER NOT NULL DEFAULT 0,
  builds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chain, token_address, bucket)
);

CREATE INDEX IF NOT EXISTS token_activity_bucket_idx ON token_activity (bucket DESC);
