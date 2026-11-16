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

Contract addresses will be published here after deployment and independent review.
