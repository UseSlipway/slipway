CREATE TABLE IF NOT EXISTS trade_quotes (
  id UUID PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('rhc', 'base')),
  token_address TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quote JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_quotes_expiry_idx ON trade_quotes (expires_at);
