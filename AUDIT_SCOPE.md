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
| Base | 8453 | [`0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074`](https://basescan.org/address/0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074) | [`contracts/deployments/base-8453.json`](contracts/deployments/base-8453.json) |
| Robinhood Chain | 4663 | [`0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074`](https://robinhoodchain.blockscout.com/address/0xDf5c82a4e0d905f467dd93c9ff72496F31E9D074) | [`contracts/deployments/robinhood-4663.json`](contracts/deployments/robinhood-4663.json) |

The deployment records contain transaction and explorer links, the original deployment build metadata hash, the locally verified artifact hash, masked runtime hash, immutable configuration, and the block at which the verifier last checked the deployment. The original deployment source maps to public build-of-record commit `4474c31a85ff06cb1d2437c44603900e42259151`, tagged `slipway-restricted-router-build`. Rebuilding that commit with its recorded compiler settings reproduces the recorded deployment metadata hash. Sourcify reports exact creation and runtime matches for both chains; BaseScan and Robinhood Blockscout explorer-side status are tracked separately in the deployment records.

## Review release

The annotated release tag `slipway-audit-remediation-2026-11-23` identifies the remediation source revision and has a corresponding tag on the public mirror. The separate `slipway-restricted-router-build` tag identifies the source tree used to reproduce the deployed router build. Do not reuse an AI rescore estimate as an auditor-issued score.

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

The scheduled deployment-verification workflow uses `BASE_RPC_URL` and `RHC_RPC_URL` repository secrets when configured, and otherwise uses the chains' public read-only RPC endpoints. It rechecks router runtime and immutable configuration daily. The backend event indexer continuously watches new blocks for legacy-router trade events and ERC-20 outflows; configure `SECURITY_ALERT_WEBHOOK_URL` in Render to forward alerts to an operations channel. See [`INCIDENT_RUNBOOK.md`](INCIDENT_RUNBOOK.md).
