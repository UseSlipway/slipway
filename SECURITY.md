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

The public frontend's `API_KEY` is a server-to-server proxy credential. It prevents direct unauthenticated access to the backend host, but it is not an end-user authorization mechanism.
