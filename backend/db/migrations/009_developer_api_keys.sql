CREATE TABLE IF NOT EXISTS developer_api_keys (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS developer_api_keys_wallet_idx
  ON developer_api_keys (wallet_address, created_at DESC);
