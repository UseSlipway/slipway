ALTER TABLE trade_quotes DROP CONSTRAINT IF EXISTS trade_quotes_chain_check;
ALTER TABLE trade_quotes ADD CONSTRAINT trade_quotes_chain_check CHECK (chain IN ('rhc', 'base', 'spcx'));

ALTER TABLE transaction_submissions DROP CONSTRAINT IF EXISTS transaction_submissions_chain_check;
ALTER TABLE transaction_submissions ADD CONSTRAINT transaction_submissions_chain_check CHECK (chain IN ('rhc', 'base', 'spcx'));

ALTER TABLE chain_events DROP CONSTRAINT IF EXISTS chain_events_chain_check;
ALTER TABLE chain_events ADD CONSTRAINT chain_events_chain_check CHECK (chain IN ('rhc', 'base', 'spcx'));

ALTER TABLE chain_event_cursors DROP CONSTRAINT IF EXISTS chain_event_cursors_chain_check;
ALTER TABLE chain_event_cursors ADD CONSTRAINT chain_event_cursors_chain_check CHECK (chain IN ('rhc', 'base', 'spcx'));

ALTER TABLE launch_quotes DROP CONSTRAINT IF EXISTS launch_quotes_chain_check;
ALTER TABLE launch_quotes ADD CONSTRAINT launch_quotes_chain_check CHECK (chain IN ('rhc', 'base', 'spcx'));
ALTER TABLE launch_quotes DROP CONSTRAINT IF EXISTS launch_quotes_venue_check;
ALTER TABLE launch_quotes ADD CONSTRAINT launch_quotes_venue_check CHECK (venue IN ('pons', 'clanker-v4', 'orbit'));

ALTER TABLE token_activity DROP CONSTRAINT IF EXISTS token_activity_chain_check;
ALTER TABLE token_activity ADD CONSTRAINT token_activity_chain_check CHECK (chain IN ('rhc', 'base', 'spcx'));
