# Architecture and trust boundaries

## Request and execution flow

1. The browser calls the same-origin `/api/slipway` proxy. The proxy forwards an allowlisted set of API requests and supplies the server-to-server `API_KEY`.
2. The backend validates request schemas, stores short-lived launch/trade quotes, and reads chain state through configured RPC endpoints. PostgreSQL stores workspace sessions, user drafts/watchlists, cached market responses, rate limits, and quote records.
3. For a trade or launch, the backend returns unsigned EVM transaction data. The connected wallet shows and signs each transaction and submits it to the selected chain. Slipway does not custody users' assets or sign their transactions.
4. The restricted fee router takes the caller's input token, charges capped fees, and routes through immutable chain-specific Uniswap venues or a Pons curve registered by the configured factory. It measures the output balance delta, enforces the caller's minimum output, sends output and any native refund to the caller, and clears venue/Permit2 allowances after execution.

## Trust boundaries

| Component | Trusted for | Not trusted to |
|---|---|---|
| Wallet | User consent, signatures, and transaction submission | Correctly interpret every contract call; users must review chain, token, amount, and recipient in their wallet |
| Frontend and same-origin proxy | Presenting data and attaching the backend server key | End-user authorization; the public `API_KEY` is not a user identity or secret from browser users |
| Backend | Input validation, quote construction, selected venue data, and API policy | Custody funds or make a user's transaction final; a compromised backend can still return misleading quotes or unsigned calldata |
| RPC and market providers | Reporting chain/provider data | Availability, freshness, or correctness beyond their own guarantees |
| Restricted fee router | Enforcing immutable venue addresses, fee caps, and execution accounting | Safe behavior of arbitrary tokens, a compromised chain, or defects in configured venues |
| Launch venues and tokens | Their own launch and token behavior | Fair launch outcomes, transferability, tax behavior, liquidity, or future value |
| PostgreSQL and Cloudinary | Persistence of stored workspace/media data | Serving as a trustless record or guaranteeing provider availability |

## Contract invariants

The executable regression tests are in [`contracts/test/SlipwayFeeRouter.t.sol`](contracts/test/SlipwayFeeRouter.t.sol). The intended properties are:

- A call cannot choose a venue outside the chain's constructor-configured Uniswap v3 router, Universal Router, or factory-registered Pons curve.
- The router pulls `amountIn` only from `msg.sender`; it does not use a caller-supplied `from` address.
- Protocol and integrator fees remain at or below their hard-coded caps, and output is limited to the measured balance delta.
- A route reverts when measured output is less than `amountOutMin`.
- Venue and Permit2 allowances are reset after a successful route; a revert rolls the whole transaction back.
- A Pons native buy must match the factory's token/curve record while the launch is in the bonding-curve phase.
- Native value returned during execution is refunded to the trader, including Pons partial fills.
- The reentrancy guard remains held until output/refunds are delivered and the event is emitted.

## Operational controls and limits

- `SLIPWAY_TRADING_ENABLED=false` pauses trade quote/build routes. The current default is active.
- The legacy routers are immutable and remain unsafe if approvals to them are still outstanding. See the revocation steps in [`SECURITY.md`](SECURITY.md).
- Slipway's trade flow still requests an ERC-20 approval to the restricted router. Venue restrictions prevent that router approval from becoming an arbitrary-call drain, but Permit2 signature pulls would further reduce standing approvals.
- The router cannot guarantee a token's economics, a quote's freshness at inclusion, or venue correctness beyond the addresses and checks encoded in the contract.
- Workspace signatures authorize synchronization of that wallet's drafts/watchlists; they do not establish a broader identity or protect a compromised wallet.
- `SERVER_API_KEY` protects the backend origin from direct calls without the proxy credential. The frontend proxy is public and this key is not end-user authorization.

## Deployment verification

Run `forge build` and then `python3 script/verify_deployments.py` from `contracts/` with `BASE_RPC_URL` and `RHC_RPC_URL` configured in the environment or local `.env`. The script checks the deployment receipt/address/block, removes the Solidity metadata trailer and masks immutable slots before comparing executable runtime to the local artifact, verifies every router immutable through its getter, and records the deployment/local artifact hashes plus check block in the deployment JSON files. The script never prints RPC URLs or wallet material.
