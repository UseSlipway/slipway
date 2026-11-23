# Audit scope and evidence

This file defines the source and deployments to include in the next independent Slipway review.

## In scope

- `contracts/src/SlipwayFeeRouter.sol`, `contracts/script/Deploy.s.sol`, the Foundry test suite, and deployment verifier.
- Backend request validation, trade and launch construction, x402 facilitator, workspace authentication, rate limiting, media upload handling, and transaction submission.
- `api/slipway.js`, CI workflows, direct dependencies, and lockfiles.

## Out of scope

- Security and availability of third-party RPC, market-data, cloud-storage, wallet, token, Uniswap, and Pons systems.
- Frontend visual correctness and independent review of frontend bundle dependencies.
- Economic safety or transfer behavior of arbitrary third-party tokens.

## Deployment targets

| Network | Chain ID | Restricted router | Deployment record |
|---|---:|---|---|
| Base | 8453 | `0xDf5c82a4e0d905f467dd93c9ff72496F31A6FDCA` | [`contracts/deployments/base-8453.json`](contracts/deployments/base-8453.json) |
| Robinhood Chain | 4663 | `0xDf5c82a4e0d905f467dd93c9ff72496F31A6FDCA` | [`contracts/deployments/robinhood-4663.json`](contracts/deployments/robinhood-4663.json) |

The deployment records contain transaction and explorer links, the original deployment build metadata hash, the locally verified artifact hash, masked runtime hash, immutable configuration, and the block at which the verifier last checked the deployment.

## Review release

Create the annotated release tag `slipway-audit-remediation-2026-11-23` on the completed source revision and publish a corresponding tag for the public mirror. The report should identify that tag, its commit, the independent auditor, date, chain checks, and any accepted findings. Do not reuse the prior audit grade as an auditor-issued score.

## Verification commands

```sh
cd contracts
forge build
forge test
python3 script/verify_deployments.py
```

```sh
cd backend
bun install --frozen-lockfile --ignore-scripts
bun test
bun run check
```

CI additionally runs Slither with a reviewed high/medium finding baseline, Semgrep security rules, Gitleaks against repository history, and dependency auditing.
