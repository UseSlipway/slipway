-- Lookups for creator reputation: find a launch by token, and a creator's other launches.
-- Pons records the creator as `deployer`; Clanker as `tokenAdmin` (msgSender can be a relayer or bot).
CREATE INDEX IF NOT EXISTS chain_events_launch_token_idx
  ON chain_events (chain, (lower(coalesce(payload->'args'->>'token', payload->'args'->>'tokenAddress'))))
  WHERE event_type IN ('token.launched', 'pool.graduated');

CREATE INDEX IF NOT EXISTS chain_events_launch_creator_idx
  ON chain_events (chain, (lower(coalesce(payload->'args'->>'deployer', payload->'args'->>'tokenAdmin'))), id DESC)
  WHERE event_type = 'token.launched';
