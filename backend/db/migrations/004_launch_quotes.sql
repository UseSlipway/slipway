CREATE TABLE IF NOT EXISTS launch_quotes (
  id UUID PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('rhc', 'base')),
  wallet TEXT NOT NULL,
  venue TEXT NOT NULL CHECK (venue IN ('pons', 'clanker-v4')),
  quote JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS launch_quotes_expiry_idx ON launch_quotes (expires_at);
