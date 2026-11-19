CREATE TABLE IF NOT EXISTS transaction_submissions (
  chain TEXT NOT NULL CHECK (chain IN ('rhc', 'base')),
  tx_hash TEXT NOT NULL,
  sender TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'pending', 'confirmed', 'reverted')),
  receipt JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, tx_hash)
);

CREATE INDEX IF NOT EXISTS transaction_submissions_updated_idx ON transaction_submissions (updated_at DESC);

CREATE TABLE IF NOT EXISTS chain_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  chain TEXT NOT NULL CHECK (chain IN ('rhc', 'base')),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chain_events_stream_idx ON chain_events (id DESC);
CREATE INDEX IF NOT EXISTS chain_events_type_idx ON chain_events (event_type, id DESC);
