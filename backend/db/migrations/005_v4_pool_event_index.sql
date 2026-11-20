CREATE INDEX IF NOT EXISTS chain_events_v4_pair_idx
  ON chain_events (chain, (lower(payload->'args'->>'currency0')), (lower(payload->'args'->>'currency1')), id DESC)
  WHERE event_type = 'pool.initialized';
