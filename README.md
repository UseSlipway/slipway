# Slipway

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Slipway is an execution interface and API for token launches and trading across supported onchain venues. Wallets retain transaction signing authority.

## Product surface

| Surface | Purpose |
| --- | --- |
| Resolve and quote | Identify venue and curve state; return a normalized quote with price impact, fee lines, graduation distance, and sellability simulation. |
| Build | Return unsigned launch and trade transactions for client-side signing. Slipway does not accept private keys. |
| Submit | Relay an already-signed payload and return a signed receipt. |
| Watch | Deliver launch, curve, and graduation updates over WebSocket, webhooks, and MCP. |

## Repository structure

| Path | Purpose |
| --- | --- |
| `/src` | React/Vite frontend. |
| `/api/slipway` | Same-origin Vercel function that forwards approved frontend API routes to the Render backend. |
| `/backend` | Bun, Express, TypeScript API and PostgreSQL migrations. |
| `/contracts` | Foundry EVM contracts and deployment scripts. Solana programs are out of scope for this workspace. |
| `/scripts/sync-public.py` | Publishes sanitized `main` history to the public repository with the UseSlipway identity. |
| `/.github/workflows/backend.yml` | Backend check, GHCR image publish, then optional Render deploy hook. |
| `/.github/workflows/ci.yml` | Foundry contract build. Frontend builds and deploys through Vercel. |

## Getting started

Prerequisites: Node.js 22.12+, npm, Bun 1.4+, PostgreSQL, and Foundry for EVM contracts.

```sh
# frontend (Vite proxies /api/slipway to the local backend)
npm ci
npm run dev

# backend, in another terminal
cd backend
bun install
cp .env.example .env
# Fill in backend credentials, including DATABASE_URL.
bun run dev
```

The backend applies SQL migrations at startup. Set the relevant chain RPC and data-provider keys in the Render service environment. The frontend API proxy requires `SLIPWAY_API_URL` on Vercel, set to the Render backend origin. The browser calls only the same-origin `/api/slipway` route; no backend CORS setup is needed. EVM deployment requires local deployer secrets; never commit them.

## Deployment

- **Frontend:** Vercel. Import the repository and use the root directory. Build: `npm run build`; output: `dist`. The `/api/slipway` serverless function proxies API calls. No `vercel.json` is required.
- **Backend:** Render pulls `ghcr.io/useslipway/slipway-backend:latest`. The backend workflow publishes the image when `UseSlipway/slipway` `main` is updated, then calls `RENDER_DEPLOY_HOOK_URL`. Configure the Render image service and GHCR credentials, then add the deploy hook as a GitHub Actions secret in the public repository. Set the backend environment variables described in [`backend/.env.example`](backend/.env.example). See [`backend/DEPLOYMENT.md`](backend/DEPLOYMENT.md).
- **Contracts:** Foundry contracts live in `/contracts`; the initial fee routers are deployed to Robinhood Chain and Base. They have not been audited.

## x402 payments

The backend runs its x402 v2 exact-payment facilitator in-process for Robinhood Chain (`eip155:4663`) and Base (`eip155:8453`), exposed at `/v1/x402/supported`, `/v1/x402/verify`, and `/v1/x402/settle`. Verify and settle require the configured `X402_FACILITATOR_API_KEY` as a bearer token, and only accept exact payments in the configured USDG/USDC to Slipway pay-to addresses. The facilitator uses the x402 EVM implementation and does not need a separate `X402_FACILITATOR_URL`. The facilitator signer is funded on both chains; `X402_ENABLED` remains `false` until deliberately enabled. Codex is the planned discovery input, checked against chain state.

`SLIPWAY_RHC_FEE_ROUTER_ADDRESS` and `SLIPWAY_BASE_FEE_ROUTER_ADDRESS` identify the per-chain EVM trade-fee routers. Deployment details are in [`contracts/deployments`](contracts/deployments/). The contracts are initial implementations and have not been audited.

## Repository sync

Maintainers publish sanitized history to `UseSlipway/slipway` with `python3 scripts/sync-public.py`. The script rewrites commit identities and removes `technical-docs/` from the published history. It refuses to replace an unrelated history. Updates to `UseSlipway/slipway` run the backend and contract workflows.

## Stack

React, Vite, Bun, Express, TypeScript, PostgreSQL, Foundry, Solidity, Solana transaction builders, and MCP.

## Status

The frontend is now at the repository root. The backend remains an early scaffold: health and x402 facilitator routes exist, but token resolution, market data, quotes, unsigned trade/launch builds, submission, and event streaming are not implemented. See [`BACKEND_HANDOFF.md`](BACKEND_HANDOFF.md) and [`backend/DEPLOYMENT.md`](backend/DEPLOYMENT.md).
