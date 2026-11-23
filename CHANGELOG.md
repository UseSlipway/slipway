# Changelog

Notable project changes are recorded here. Contract deployments and audit follow-ups are linked to the technical records in `technical-docs/` and `contracts/deployments/`.

## 2026-11-23 — Restricted fee router rollout

- Replaced arbitrary venue forwarding with immutable Uniswap v3/v4 venue configuration and factory-validated Pons curve execution.
- Deployed the restricted router on Base and Robinhood Chain; deployment transactions, block numbers, compiler artifact hashes, and live verification are recorded in the chain deployment files.
- Added venue restriction, v3/v4, native input/output, Pons partial-fill, and 100,000-call invariant coverage.
- Added deployment verification, static security scans, dependency pinning, workspace/media/quote rate limits, and SIWE-style workspace challenges.
- Upgraded the x402 packages to a release using Zod 4 and removed the affected Zod 3 copy from the lockfile.
