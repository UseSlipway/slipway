# Slipway

![CI](https://github.com/UseSlipway/slipway/actions/workflows/ci.yml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.x-000000?logo=bun&logoColor=white)
![TanStack Start](https://img.shields.io/badge/TanStack_Start-1.x-FF4154?logo=tanstack&logoColor=white)

**Launch, buy and sell across major onchain launchpads through one API, SDK and MCP server. Every write returns an unsigned transaction for your own wallet to sign.**

Slipway is being built as open, multi-chain execution infrastructure for token launches, bonding curves, and post-graduation trading. The initial design covers Solana, Robinhood Chain, Base, and BNB Chain. Robinhood Chain is the proposed first launch target; venue support and launch timing remain subject to the checks in the product overview.

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
| `/src` | TanStack Start frontend and server functions. |
| `/backend` | Bun, Express, TypeScript API and PostgreSQL migrations. |
| `/contracts` | Foundry EVM contracts and deployment scripts. Solana programs are out of scope for this workspace. |
| `/scripts/sync-public.py` | Publishes sanitized `main` history to the public repository with the UseSlipway identity. |
| `/.github/workflows` | Frontend, backend, and contract build checks plus optional Render deploy hook. |

## Getting started

Prerequisites: Bun 1.4+, PostgreSQL, and Foundry for EVM contracts.

```sh
# frontend
bun install
cp .env.example .env
bun run dev

# backend, in another terminal
cd backend
bun install
cp .env.example .env
# Set DATABASE_URL when the database is available.
bun run dev
```

The backend applies SQL migrations at startup. Set the relevant chain RPC and data-provider keys in the service environment as those integrations are implemented. EVM deployment requires `DEPLOYER_PRIVATE_KEY` and `FEE_RECIPIENT`; never commit either value.

## Deployment

- **Frontend:** Vercel. Import the repository and use the root directory; the build selects the Vercel Nitro preset. No `vercel.json` is required.
- **Backend:** Render, rooted at `backend`, using Bun. Build: `bun install --frozen-lockfile && bun run check`. Start: `bun run start`. Configure `DATABASE_URL`, RPC endpoints, and provider credentials as service environment variables. CI can call `RENDER_DEPLOY_HOOK_URL` when configured.
- **Contracts:** deploy separately with Foundry after contract design, chain configuration, and audit review are settled.

## x402 payments

The backend runs its x402 v2 exact-payment facilitator in-process for Robinhood Chain (`eip155:4663`) and Base (`eip155:8453`), exposed at `/v1/x402/supported`, `/v1/x402/verify`, and `/v1/x402/settle`. Verify and settle require the configured `X402_FACILITATOR_API_KEY` as a bearer token, and only accept exact payments in the configured USDG/USDC to Slipway pay-to addresses. The facilitator uses the x402 EVM implementation and does not need a separate `X402_FACILITATOR_URL`. `X402_ENABLED` remains `false` until the dedicated facilitator signer is funded for gas on both chains. Codex is the planned discovery input, checked against chain state.

`SLIPWAY_RHC_FEE_ROUTER_ADDRESS` and `SLIPWAY_BASE_FEE_ROUTER_ADDRESS` are unrelated to x402. They identify the separate per-chain EVM trade-fee router contracts used by built trades to collect Slipway and integrator fees on-chain. They stay empty until deployed. The router is an initial implementation and has not been audited.

## Dual repository sync

The private repository is the source of truth on `main` (`origin`). `python3 scripts/sync-public.py` rewrites commit identities for `UseSlipway`, publishes to `public-origin/main`, and removes `technical-docs/` from the public history. It refuses to replace an unrelated public history. Do not push the private branch directly to the public remote.

## Stack

TanStack Start, React, TypeScript, Vite, Tailwind CSS, Bun, Express, PostgreSQL, Foundry, Solidity, Solana transaction builders, and MCP.

## Status

This repository is an initial scaffold. Product behavior, launchpad adapters, MCP tools, SDK packages, x402 payments, graduation watchers, and production contracts still need implementation. See the private `technical-docs/Slipway_Overview.md` for the dated product brief and its open verification items.
