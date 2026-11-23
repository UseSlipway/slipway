# Incident runbook

## Legacy-router activity or monitor failure

The backend event indexer continuously scans new Base and Robinhood Chain blocks for `TradeExecuted` logs and ERC-20 transfers out of the two unsafe legacy router addresses. It uses a persistent cursor and requests at most 100 blocks at a time. Activity emits a `legacy_router_activity_alert` log and, when `SECURITY_ALERT_WEBHOOK_URL` is configured, posts a JSON notification with `text` and `content` fields to a Slack/Discord-compatible webhook. RPC failures emit `legacy_router_monitor_error`, send the same type of notification when configured, and leave the cursor unchanged for retry. Subscribe to Render log alerts or configure the webhook; the monitor starts at the current safe head and does not backfill history.

1. Open the Render log or webhook alert and record the chain, block, transaction hash, watched router, and event type. For an RPC error, confirm whether it is a provider outage; the unchanged cursor means the range will be retried.
2. Pause trade construction by setting `SLIPWAY_TRADING_ENABLED=false` in the Render backend environment and confirm the service has restarted. Keep launch and read-only market endpoints operating if they are unaffected.
3. Inspect the transaction and token `Transfer` logs in the relevant block explorer. Determine which token and user approvals were involved. Do not assume the caller or recipient is the affected wallet.
4. Notify affected users with the router, token, and chain details. Direct them to revoke token allowances for both legacy router addresses on every chain where they used Slipway. Never ask users to share seed phrases or private keys.
5. If an operational credential may be exposed, rotate the facilitator signer, `SERVER_API_KEY`, or deploy-hook secret in its authorized secret store; update dependent services and verify readiness. Do not rotate the immutable fee-router recipient or deployer address in deployment records without a reviewed migration plan.
6. Re-enable trading only after the activity is understood, the current restricted routers pass the scheduled deployment verifier, both `/health` and authenticated `/ready` pass, and the project operator records the decision.
7. Preserve the alert, transaction links, affected assets, timeline, response actions, and user notifications in the internal incident record.

## Restricted-router verification failure

Treat a mismatch in runtime bytecode, deployment receipt, chain ID, or immutable configuration as a release-blocking event. Keep trading paused, compare the affected chain's deployment record with the verified public build-of-record tag, and investigate RPC correctness before taking any deployment action. The currently deployed router is immutable; a replacement requires an independently reviewed deployment and an explicit rollout plan.
