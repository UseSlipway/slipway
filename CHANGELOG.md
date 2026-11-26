# Changelog

Notable project changes are recorded here. Contract deployments and audit follow-ups are linked to the technical records in `technical-docs/` and `contracts/deployments/`.

## 2026-11-26 — Product and interface updates

Site and dapp only; no contract changes. Release notes are also published at https://tryslipway.com/updates.

### Product

- **Clearer market view:** search and filter supported markets, see chart freshness and availability, and add or open watchlist items from token and pool views.
- **Smoother launch workspace:** a step-by-step launch progress rail; image requirements, real upload progress and inline retry; unfinished launches and saved drafts resume where you left off; the confirmation shows the new token address, transaction link and next steps.
- **Better trade preparation:** input balance and live quote, with what you pay, expected and minimum output, route, fees and slippage side by side before building a transaction.
- **Wallet workspace for active users:** wallet ownership and sync status, a notice when the connected wallet changes, sorting, filtering and paging for launches, drafts and watched tokens, and a day-grouped activity timeline that includes onchain launches.
- **Clearer trading status:** the trade page reports availability through the restricted routers and keeps the legacy-approval reminder separate.
- **Just graduated feed:** the market board shows Pons tokens whose bonding curve just filled and moved into a Uniswap pool on Robinhood Chain, newest first, with FDV and 24h volume; graduated tokens carry a badge in the pool list.
- **Recent trades on the token page:** the last 24 hours of buys and sells for the pool with value, amount, price, wallet and transaction links; filters for side, minimum size and your own trades; a buy/sell summary with unique traders. Refreshes every 45 seconds.
- **Chart upgrades:** volume bars, a current-price line, a hover or keyboard crosshair with open, high, low, close, change and volume, and markers for graduation, pool creation and the connected wallet's own buys and sells, with a toggle. The chart no longer blanks while it refreshes.
- **Trending on Slipway:** the market board ranks tokens by the quotes and prepared trades Slipway served in the last hour, plus how many Slipway watchlists follow them (or 24 hours when it is quiet). Activity is stored as anonymous counts per token in 10-minute buckets, with no wallets, amounts or IPs.
- **Creator history on token pages:** who launched the token, how many tokens that wallet has launched and how many graduated, when it was first seen, its recent launches, and plain-language flags (first launch, serial launcher, many launches in a day, none graduated). Built from indexed Pons and Clanker launch events; history only, not a safety rating.
- **Market data reliability:** the server now spends at most 24 GeckoTerminal requests a minute, gives live visitors priority over background refreshes, only refreshes data someone viewed in the last two minutes, and pauses after a rate-limit response while serving cached data. Charts keep their last candles and retry automatically when the provider is busy.
- **Landing and mobile polish:** a tighter first visit, better narrow-screen layouts for the dashboard, launch and trade views, and clearer live event feed states.

### Maintenance

- **Faster, lighter pages:** below-the-fold imagery loads on demand, key images are smaller, market responses are briefly reused, and platform videos are deferred on mobile, reduced-motion and data-saver settings.
- **Deep links:** `/whitepaper`, `/roadmap` and `/updates` load directly instead of returning a host 404; the build now creates a page for every route in the app's route table.
- **Readable without JavaScript:** the homepage HTML names the site, the public repository, the Slipway token contract (`0xef8aad91c4292d469bd51f70835c8a6cb9c3f590`) and the fee router (`0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074`).
- Published the Slipway token contract address on the site and in the README.

## 2026-11-23 — Restricted fee router rollout

- Replaced arbitrary venue forwarding with immutable Uniswap v3/v4 venue configuration and factory-validated Pons curve execution.
- Deployed the restricted router on Base and Robinhood Chain; deployment transactions, block numbers, compiler artifact hashes, and live verification are recorded in the chain deployment files.
- Added venue restriction, v3/v4, native input/output, Pons partial-fill, and 100,000-call invariant coverage.
- Added deployment verification, static security scans, dependency pinning, workspace/media/quote rate limits, and SIWE-style workspace challenges.
- Upgraded the x402 packages to a release using Zod 4 and removed the affected Zod 3 copy from the lockfile.
