# Contributing

Slipway is at scaffold stage. Current contributions should focus on the API schema, adapter boundaries, unsigned transaction construction, quote normalization, and contract invariants described in the product overview.

## Out of scope

- Private-key custody or signing in Slipway services.
- Routing through custodial trading terminals.
- Claims that a token is safe, vetted, or protected from MEV or snipers.
- Public roadmap or market claims that have not been re-verified against dated sources.

## Setup

Install Bun 1.4+ and PostgreSQL. Copy the relevant `.env.example` file for the frontend, backend, or contracts and configure local values. Install Foundry only when working on Solidity.

## Workflow

Use a focused branch and pull request. Keep each change to one concern, describe the user-visible behavior and affected chains/venues, and include the verification performed. Discuss protocol, fee, or contract changes before implementing them. Use imperative, plain-English commit messages.

For bug reports, include the chain and venue, operation attempted, sanitized request/quote/receipt, actual result, expected result, and reproduction steps. Never include private keys, bearer tokens, or unredacted wallet secrets. Report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md).
