import { describe, expect, test } from "bun:test";
import { calculateMinimumOutput, calculateProtocolFee } from "../src/routes/trades";

describe("exact-input fee and slippage arithmetic", () => {
  test("deducts the configured protocol fee using integer token units", () => {
    expect(calculateProtocolFee(1_000_000n)).toBe(2_000n);
    expect(calculateProtocolFee(49n)).toBe(0n);
    expect(calculateProtocolFee(0n)).toBe(0n);
  });

  test("sets the minimum output conservatively for each slippage bound", () => {
    expect(calculateMinimumOutput(1_000_000n, 0)).toBe(1_000_000n);
    expect(calculateMinimumOutput(1_000_000n, 50)).toBe(995_000n);
    expect(calculateMinimumOutput(1_000_000n, 5000)).toBe(500_000n);
    expect(calculateMinimumOutput(1n, 50)).toBe(0n);
  });
});
