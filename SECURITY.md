# Security policy

## Scope

This policy covers the Slipway API, frontend, SDK/MCP interfaces, transaction builders, fee router, and deployment tooling. Third-party launchpads, tokens, RPC providers, indexers, and wallets are outside Slipway's control.

## Reporting

Email **slipway@atomicmail.io** with a concise report and reproduction steps. Do not open a public issue for a suspected vulnerability. The project will acknowledge reports within 48 hours and provide a remediation plan for confirmed critical issues within seven days where practical.

Please avoid accessing other users' data, disrupting live services, or submitting transactions without authorization. Good-faith reports will be credited with the reporter's consent.

## Main attack surfaces

- Forged or replayed signed payloads and unsafe transaction construction.
- Incorrect venue or curve resolution, quote staleness, and graduation races.
- Fee calculation, integrator fee caps, and router recipient configuration.
- Malicious token metadata delivered through APIs, webhooks, or MCP tools.
- Webhook authentication, API authorization, and x402 payment verification.

## Router security advisory — 2026-11-23

Trading uses restricted fee routers on Base and Robinhood Chain. The legacy fee routers listed below allow an arbitrary caller-selected venue call while users may have outstanding token allowances to the router. A malicious call can use those allowances to transfer a user's approved tokens. The restricted routers reject arbitrary venues, but existing approvals to legacy routers remain independently revocable and should be removed.

If you previously approved a Slipway fee router, revoke each token allowance to these addresses on every network where you used Slipway:

- Base: [`0x56d15a85d9f4ecec16c002dc5a02ef6b94c215c5`](https://basescan.org/address/0x56d15a85d9f4ecec16c002dc5a02ef6b94c215c5) and [`0xe7635ad3fda4df9800b63cdcd164669d31a6fdca`](https://basescan.org/address/0xe7635ad3fda4df9800b63cdcd164669d31a6fdca)
- Robinhood Chain: [`0x56d15a85d9f4ecec16c002dc5a02ef6b94c215c5`](https://robinhoodchain.blockscout.com/address/0x56d15a85d9f4ecec16c002dc5a02ef6b94c215c5) and [`0xe7635ad3fda4df9800b63cdcd164669d31a6fdca`](https://robinhoodchain.blockscout.com/address/0xe7635ad3fda4df9800b63cdcd164669d31a6fdca)

Do not grant new approvals to these legacy addresses. Router approvals are specific to both the token and spender; revoke all token allowances granted to each listed spender on both networks where you traded. The API returns `503` for trade quote and build requests only when `SLIPWAY_TRADING_ENABLED=false` or when a service is unavailable.

The restricted router deployment address is [`0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074`](https://basescan.org/address/0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074) on Base and [`0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074`](https://robinhoodchain.blockscout.com/address/0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074) on Robinhood Chain. The deployment records include transaction hashes and block numbers.

The deployed source has an exact Sourcify creation-code and runtime match on both networks: [Base](https://repo.sourcify.dev/8453/0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074) and [Robinhood Chain](https://repo.sourcify.dev/4663/0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074). Sourcify's forwarding service reported its BaseScan/Etherscan submission quota was full; Robinhood Blockscout forwarding was submitted, but its status endpoint was not reachable from the verification environment. The deployment records distinguish this explorer forwarding status from the exact Sourcify match and the independent on-chain runtime/configuration check.

The public frontend's `API_KEY` is a server-to-server proxy credential. It prevents direct unauthenticated access to the backend host, but it is not an end-user authorization mechanism.

## Privileged credentials and operational owners

| Privileged item | Current holder of record | Where access is controlled |
|---|---|---|
| Fee recipient / x402 facilitator signer `0x7aD8085132Ee3C945e06f618D64EB374664B5054` | Slipway project operator | Signer material is kept in local `backend/.env` and the Render service environment; the address is public and immutable in the routers. |
| Restricted-router deployer `0xdbd635554a2ca93afabe90d196830bc0eb55933f` | Authorized deployment operator | Key is in the ignored local `contracts/wallet.json`; it is not stored in source control or GitHub Actions. |
| `SERVER_API_KEY` | Slipway deployment operator | Render backend and Vercel server environment settings. Rotate both values together. |
| Render deploy hook | Public repository administrators | GitHub Actions secret `RENDER_DEPLOY_HOOK_URL`; it is not available to workflow code as a printed value. |

The repository records operational roles, not the names of individual custodians. The project operator is responsible for limiting access to those accounts, maintaining the current human keyholder list outside the repository, and removing access when a maintainer leaves. The fee recipient and facilitator signer currently use the same public address; the private key is not documented here.

## Accepted risks

- **Legacy router approvals:** the old contracts cannot be upgraded or disabled. Users must revoke allowances to the listed addresses. Slipway cannot revoke a user's token approval for them.
- **ERC-20 approval to the restricted router:** trades still require an approval to the new router. The immutable venue set prevents arbitrary venue calls, but exact approvals and Permit2 signature-based pulls would further reduce standing exposure.
- **Third-party token and venue behavior:** fee-router tests use mocks. A token can tax, rebase, blacklist, or otherwise behave unexpectedly; external venues, RPCs, and launchpads can fail or return stale data. Fork tests and independent review remain follow-ups.
- **Operational signer compromise:** compromised facilitator or deployment credentials could harm service operations or deployments. Keep credentials in the designated local/cloud secret stores, restrict account access, rotate affected keys, and pause trading during incident response.
- **Monitoring coverage:** the backend monitor scans new `TradeExecuted` and ERC-20 transfer-out logs after its cursor is initialized. It does not retroactively scan history on first startup or detect native-asset movements that emit no logs. An RPC outage is logged and the cursor remains in place for retry.

## Monitoring and response

The backend event indexer continuously scans new blocks on both chains, using a persistent database cursor and no more than 100 blocks per RPC request. It emits `legacy_router_activity_alert` for legacy router trade events or ERC-20 outflows; configure a Slack/Discord-compatible JSON endpoint as `SECURITY_ALERT_WEBHOOK_URL` in Render to forward activity and monitor-error notifications to an operations channel. RPC failures emit `legacy_router_monitor_error` and leave the cursor unchanged so the next poll retries. Follow [`INCIDENT_RUNBOOK.md`](INCIDENT_RUNBOOK.md) when either event appears or the monitor stops progressing.
