# Fee router invariants

The router is an execution boundary for caller-funded trades. Tests live in [`test/SlipwayFeeRouter.t.sol`](test/SlipwayFeeRouter.t.sol) and [`test/SlipwayFeeRouterInvariant.t.sol`](test/SlipwayFeeRouterInvariant.t.sol).

## Safety properties

1. **Caller isolation:** trade input is pulled only from `msg.sender`; a caller cannot nominate a victim address as the input owner.
2. **Venue restriction:** v3, v4, and Pons entrypoints enforce their configured venue. Pons additionally requires the factory's exact token/curve registration and active curve phase.
3. **Bounded charges:** protocol fee is at most 20 bps; integrator fee is at most 100 bps.
4. **Measured output:** the router transfers only the output token balance delta caused by the venue call and reverts below `amountOutMin`.
5. **Allowance cleanup:** successful venue interactions leave no router-to-venue or router-to-Permit2 token allowance.
6. **No stranded route delta:** residual input and native refunds are sent back to the caller; failed transfers revert the full operation.
7. **Reentrancy safety:** external execution is guarded until token/native settlement and event emission complete.

## Test commands and generated workload

```sh
forge test
forge test --match-contract SlipwayFeeRouterInvariantTest
```

The invariant suite runs 1,000 campaigns at depth 100 (100,000 generated handler calls). It explores allowed v3 routes and arbitrary-venue attempts with generated amounts, fee rates, and minimum outputs. Deterministic tests separately exercise v3, v4 with Permit2 allowance cleanup, native v4 input and output, arbitrary-venue rejection with an existing victim approval, and Pons partial-fill refunds. Mock coverage does not prove third-party venues or Permit2 behave correctly on a live chain; fork/integration tests remain useful follow-up coverage.
