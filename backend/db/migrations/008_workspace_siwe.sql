-- Old sessions were minted from sign-in messages without a domain binding.
-- Invalidate them so every workspace session is established with the SIWE message.
DELETE FROM wallet_workspace_sessions;
DELETE FROM wallet_workspace_challenges;
