-- Creator-supplied details for a token, editable only by the wallet that launched it onchain.
CREATE TABLE IF NOT EXISTS creator_profiles (
  chain TEXT NOT NULL CHECK (chain IN ('rhc', 'base')),
  token_address TEXT NOT NULL,
  creator_address TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  x TEXT NOT NULL DEFAULT '',
  telegram TEXT NOT NULL DEFAULT '',
  banner_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, token_address)
);
