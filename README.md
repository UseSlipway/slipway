# Slipway

Slipway is a non-custodial interface for discovering tokens and preparing trades across Base and Robinhood Chain. The app builds unsigned EVM transactions for a connected wallet to review and sign; Slipway does not hold wallet keys or custody user assets.

**Slipway token CA:** `0xef8aad91c4292d469bd51f70835c8a6cb9c3f590`

## Features

- Explore token and pool market data.
- Request trade quotes and build unsigned trades for supported EVM venues.
- Create token launches on supported launch venues.
- Sync wallet-owned drafts and watchlists across devices.
- Use x402 payment flows on supported networks.

## Run locally

You need Bun 1.4.5, PostgreSQL, and Foundry for contract commands.

Start the API in one terminal:

```sh
cd backend
bun install --frozen-lockfile --ignore-scripts
cp .env.example .env
```

Set `DATABASE_URL`, `RHC_RPC_URL`, and `BASE_RPC_URL` in `backend/.env`. The API applies database migrations on startup. Set `X402_ENABLED=false` if you are not configuring the local facilitator.

```sh
bun run dev
```

In another terminal, start the frontend:

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

The frontend runs on Vite and forwards `/api/slipway` to `http://localhost:3001`. Set `SLIPWAY_API_URL` in the root `.env` if the API uses another local address. `VITE_WALLETCONNECT_PROJECT_ID` enables WalletConnect.

## Test and build

```sh
# Frontend tests and production build
bun test tests/*.test.js
bun run build

# Backend tests and typecheck
cd backend
bun install --frozen-lockfile --ignore-scripts
bun test
bun run check

# Fee router tests and invariants
cd ../contracts
forge build
forge test
```

## Deploy and verify contracts

Contract deployment is for maintainers. Configure `BASE_RPC_URL`, `RHC_RPC_URL`, and `FEE_RECIPIENT` in `contracts/.env`. The deployment script reads `contracts/wallet.json`, which is ignored by Git and must remain local. Its JSON fields are `address` and `private_key`.

Deploy to one network at a time:

```sh
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url base --broadcast
forge script script/Deploy.s.sol:Deploy --rpc-url rhc --broadcast
```

After updating the corresponding deployment records, verify the live router against the local artifact and immutable configuration:

```sh
forge build
python3 script/verify_deployments.py
```

Never commit wallet files, API keys, RPC credentials, or deployment secrets.

## Links

- [Website](https://tryslipway.com)
- [Developer docs](https://tryslipway.com/developers)
- [GitHub](https://github.com/UseSlipway/slipway)
- [X](https://x.com/slipwaytech)
