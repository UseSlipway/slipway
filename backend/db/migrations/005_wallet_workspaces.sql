CREATE TABLE IF NOT EXISTS wallet_workspace_challenges (
  wallet_address TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_workspace_sessions (
  token_hash TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_workspace_sessions_wallet_idx ON wallet_workspace_sessions (wallet_address);
CREATE INDEX IF NOT EXISTS wallet_workspace_sessions_expiry_idx ON wallet_workspace_sessions (expires_at);

CREATE TABLE IF NOT EXISTS wallet_workspaces (
  wallet_address TEXT PRIMARY KEY,
  drafts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(drafts) = 'array'),
  watches JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(watches) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
