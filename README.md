# Slipway

Slipway is an interface for discovering tokens and preparing on-chain trades across multiple networks. It builds unsigned transactions for your wallet to review and sign; Slipway never needs your wallet’s private key.

## Features

- Explore token markets and pool data.
- Resolve token routes and request trade quotes on Base and Robinhood Chain.
- Prepare unsigned trades that route through Slipway’s fee router.
- Access supported stablecoin payment flows through the x402 facilitator.
- Follow a consistent workflow across supported networks.

## Run locally

You’ll need Node.js 22.12 or newer, npm, Bun 1.4 or newer, and PostgreSQL.

Install dependencies and start the backend:

```sh
cd backend
bun install --frozen-lockfile
cp .env.example .env
```

Set `DATABASE_URL`, `RHC_RPC_URL`, and `BASE_RPC_URL` in `backend/.env`. Database migrations run when the backend starts. To run the API without configuring the local x402 facilitator, set `X402_ENABLED=false`.

```sh
bun run dev
```

In a second terminal, install dependencies and start the frontend:

```sh
npm ci
cp .env.example .env
npm run dev
```

The frontend calls `/api/slipway`, which Vite forwards to `http://localhost:3001`. Set `SLIPWAY_API_URL` in the root `.env` if the backend is running at a different address.
