# Slipway website — developer handoff

## Start here

This package is the current React/Vite website, with its local images, videos, fonts, reference graphics, build scripts, lockfile and API tests. It does not include a backend implementation, deployed service credentials, production wallets, user workspace data, or hosting account access. The included Slipway Overview and Backend documents are product specifications, including proposed decisions that must be confirmed before deployment.

Use Node.js 22.12+ or 24+ and npm. From this directory:

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite prints the local URL. `npm run build` generates `dist/`, including direct-entry pages for `/platform`, `/dashboard`, `/developers` and `/networks`. Configure the production host to serve the static directory and fall back to `index.html` for client routes. Asset paths are root-relative, so deploy at the origin root or adjust the base and paths for a subdirectory. Platform is a same-origin iframe at `/platform-experience.html` and uses parent-window navigation events; keep it on the same origin.

## Integration map

- `src/App.jsx`: routes, navigation and page transitions.
- `src/Landing.jsx`, `src/KymaSections.jsx`, `src/KymaMotion.jsx`, `src/kyma.css`: landing page and motion.
- `src/Launchpad.jsx`, `src/launchpad.css`: launchpad views, expandable sidebar, locally saved creation drafts, token resolution, launch quoting and unsigned launch build controls, and analytics shell. `src/MarketBoard.jsx`, `src/MarketDetail.jsx` and `src/market-board.css` provide live pool discovery, OHLCV charts and the buy/sell quote interface. `src/Dashboard.jsx`: existing workspace, wallet connection, forms and local persistence.
- `src/api.js`: current HTTP client, address validation and quote payload.
- `public/platform-experience.html`: Platform page and its animations.
- `src/DashboardGradient.jsx`, `getlayers.json`: dashboard gradient.
- `public/assets/`: all required production media, logos and Platform video. `scripts/optimize-images.mjs` creates responsive WebP variants from included JPEG originals.
- `tests/api.test.js`: current API-client tests. `ASSETS.md` records asset sources; check their licenses and deployment rights.

## Backend boundary

Workspace drafts, watchlist, settings and activity are stored in the browser's `localStorage` (`slipway.workspace.v1`); they are not synchronized to a server. The dashboard can connect an injected EVM or Solana wallet. It does not itself sign, submit, or execute transactions. The frontend calls the same-origin `/api/slipway` server route. On Vercel, `api/slipway/[...path].js` forwards a fixed allowlist of methods and routes to the backend URL stored in the server-only `SLIPWAY_API_URL`. Locally, Vite proxies the same path to `SLIPWAY_API_URL` (default `http://localhost:3001`). No browser-to-Render CORS configuration is needed.

The client posts JSON to `/api/slipway/v1/quote`, `/api/slipway/v1/build/trade`, `/api/slipway/v1/launch/quote` and `/api/slipway/v1/build/launch`, and reads `/api/slipway/v1/tokens/{chain}/{token}`; it uses a 15-second timeout and omits credentials. The current backend does not yet implement these trading, launch or token-resolution endpoints, so those features remain unavailable until they are built.

Quote request shape: `{chain, token, side, amount, amountType:'in', slippageBps}`. The interface requires a response with `id` or `quoteId`, `expectedOut`, `assetOut`, and an unexpired `expiresAt` to proceed; it displays optional `minOut`, `chain`, `venue`, `priceImpactBps`, `feeLines`, `warnings`. Build request: `{quoteId,wallet,accountKind}`; response needs `buildId` and a `payloads` array. Confirm and reconcile these shapes with the backend specification before implementation; this client is not a complete SDK or a security verifier.

No completed token-launch flow, payment flow, plan purchase, account authentication, server-side workspace, on-chain trade relay, or Slipway backend service is included. The launchpad stores drafts locally; published listings, trending data, prices, charts and market analytics require backend integration. Pricing and fees in the supplied documents are proposals, not confirmed charges. Define and implement the final billing, authentication, signing verification, authorization, monitoring, error contracts, rate limits and production security with the backend team. Do not put private keys or service secrets in frontend source or the repository. Consult `product-documents/` for the full product and backend briefs, and `IMPLEMENTATION.md` for current behavior and limitations.

Launch quotes require an explicit venue and a published metadata URI; selected images are saved locally and are not uploaded by this frontend. The launch builder refuses requirements requiring additional signing or account setup, checks the wallet chain and quote expiration, and returns an unsigned payload for review. No signing, submission or on-chain execution is implemented here. The frontend uses the public GeckoTerminal API for trending liquidity pools, pool search, price snapshots and OHLCV charts across the four supported networks. The provider caches responses for approximately one minute and imposes a public rate limit; these are not tick-by-tick streams and are not necessarily Slipway launches or tradeable through Slipway. Production traffic should use an appropriately licensed, rate-managed backend data source. Graduation status, launch-specific rankings and overall market analytics require additional backend integration; the supplied backend specification does not define a launch-listing endpoint. Buy/sell quotes and unsigned builds require the Slipway service. The trade UI does not sign or submit transactions.

## Repository transfer

Copy the contents into the team's repository and commit them. `.git`, dependency installs, generated build output, and the original hosting project identity are intentionally excluded. The lockfile enables reproducible install. No environment variables are required to run the frontend; an API endpoint is entered in Settings. Configure your own deployment and secrets outside the repository. Test actual wallets and responsive behavior on physical devices before production.


## Trade screen

`src/TradePage.jsx` provides the standalone Trade workspace, including live pool search, chart selection, buy/sell order entry, quote validation and unsigned transaction download. It uses the same configured Slipway endpoint and wallet as the rest of the dashboard. Pool discovery and charts use the public GeckoTerminal API and are refreshed approximately once per minute; pool data does not establish route eligibility. The Slipway service must supply quotes, eligibility, simulation, fees and unsigned builds. Wallet signing and transaction submission still require backend/client integration.
