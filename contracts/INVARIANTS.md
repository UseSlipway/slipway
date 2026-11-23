# Fee router invariants

The router is an execution boundary for caller-funded trades. Tests live in [`test/SlipwayFeeRouter.t.sol`](test/SlipwayFeeRouter.t.sol) and [`test/SlipwayFeeRouterInvariant.t.sol`](test/SlipwayFeeRouterInvariant.t.sol).

## Safety properties and executable checks

| Property | Regression test | Invariant test |
|---|---|---|
| Caller isolation: input can only be pulled from the current caller; a caller cannot name a victim as input owner. | `testRejectsArbitraryVenueEvenWhenVictimHasApprovedRouter` | `invariant_noCallerCanMoveVictimFundsAndRouterHasNoTokenDust` |
| Venue restriction: each Uniswap entrypoint requires its configured router; Pons requires the factory's exact token/curve mapping and active bonding phase. | `testRejectsArbitraryVenueEvenWhenVictimHasApprovedRouter`, `testV4RejectsWrongVenue`, `testV4NativeRejectsWrongVenue`, `testPonsRejectsWrongCurve`, `testPonsRejectsNonBondingPhase` | `invariant_noCallerCanMoveVictimFundsAndRouterHasNoTokenDust` |
| Fee bounds and arithmetic: protocol fee is at most 20 bps; integrator fee is at most 100 bps; fees use integer floor division. | `testRejectsProtocolFeeAboveCap`, `testRejectsIntegratorFeeAboveCap`, `testFuzzFeeMath` | — |
| Measured output and minimum: only the output balance delta is delivered, and execution reverts below `amountOutMin`. | `testAllowedV3RouteTransfersOnlyMeasuredOutput`, `testRevertsWhenMeasuredOutputIsBelowMinimum` | `invariant_noCallerCanMoveVictimFundsAndRouterHasNoTokenDust` |
| Integrator recipient: a fee-bearing route rejects zero and router self-recipients. | `testRejectsZeroIntegratorRecipient`, `testRejectsRouterAsIntegratorRecipient` | — |
| Route input: zero-sized trades are rejected. | `testRejectsZeroAmount` | — |
| Invalid configuration/address inputs are rejected. | `testRejectsZeroFeeRecipientAtConstruction`, `testRejectsPonsFactoryWithoutCodeAtConstruction`, `testRejectsZeroTokenAddress`, `testV4NativeRejectsUnwrapWithNonWrappedInput` | — |
| Allowance cleanup: successful v3/v4 interactions leave no router-to-venue or router-to-Permit2 allowance. | `testAllowedV3RouteTransfersOnlyMeasuredOutput`, `testAllowedV4RouteClearsTokenAndPermit2Allowances` | `invariant_allowedVenueAllowanceIsCleared` |
| No stranded route delta: partial Pons fills return native value to the caller; reverts roll back token movement. | `testPonsPartialFillRefundsNativeInputToTrader`, `testRevertsWhenMeasuredOutputIsBelowMinimum` | `invariant_noCallerCanMoveVictimFundsAndRouterHasNoTokenDust` |
| Native v4 conversion: configured WETH can be unwrapped for input and native output is wrapped before delivery. | `testV4NativeInputUnwrapsAndExecutes`, `testV4NativeOutputWrapsAndDelivers` | — |
| Reentrancy guard stays engaged through venue execution and settlement. | `testReentrantVenueCannotEnterRouterTwice` | `invariant_noCallerCanMoveVictimFundsAndRouterHasNoTokenDust` |

## Test commands and generated workload

```sh
forge test
forge test --match-contract SlipwayFeeRouterInvariantTest
```

The invariant suite runs 1,000 campaigns at depth 100 (100,000 generated handler calls). It explores allowed v3 routes and arbitrary-venue attempts with generated amounts, fee rates, and minimum outputs. `testFuzzFeeMath` separately fuzzes amount and fee combinations. Deterministic tests cover v3, v4 Permit2 cleanup, native v4 input/output, wrong venues, Pons curve registration and phase, fee caps, minimum output, and partial-fill refunds. Mock coverage does not prove third-party venues or Permit2 behave correctly on a live chain; fork/integration and mutation testing remain follow-up coverage.
