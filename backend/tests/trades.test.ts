import { describe, expect, test } from "bun:test";
import { quotePonsBuy, tradeChainId } from "../src/routes/trades";

describe("trade quote chain mapping", () => {
  test("accepts supported chain slugs and numeric chain IDs", () => {
    expect(tradeChainId("rhc")).toBe("rhc");
    expect(tradeChainId(4663)).toBe("rhc");
    expect(tradeChainId("base")).toBe("base");
    expect(tradeChainId(8453)).toBe("base");
    expect(tradeChainId("spcx")).toBe("spcx");
    expect(tradeChainId(46630022)).toBe("spcx");
    expect(tradeChainId("solana")).toBeNull();
  });
});

describe("Pons bonding-curve buy quote", () => {
  test("deducts curve, creator, and snipe fees before constant-product pricing", () => {
    const quote = quotePonsBuy(10_000n, 1_000_000n, 1_000_000n, 1_000_000n, 100n, 200n, 300n);
    const netInput = 10_000n - 100n - 200n - 300n;
    expect(quote.snipeBps).toBe(300n);
    expect(quote.spent).toBe(10_000n);
    expect(quote.tokensOut).toBe(netInput * 1_000_000n / (1_000_000n + netInput));
  });

  test("caps output at remaining sellable supply and recomputes spent input", () => {
    const quote = quotePonsBuy(10_000n, 1_000_000n, 1_000_000n, 1_000n, 100n, 0n, 0n);
    expect(quote.tokensOut).toBe(1_000n);
    expect(quote.spent).toBeLessThan(10_000n);
  });

  test("caps snipe tax while preserving the protocol minimum net", () => {
    const quote = quotePonsBuy(10_000n, 1_000_000n, 1_000_000n, 1_000_000n, 100n, 200n, 9_900n);
    expect(quote.snipeBps).toBe(9_600n);
    expect(quote.tokensOut).toBeGreaterThan(0n);
  });

  test("returns zero when the curve has no sellable tokens", () => {
    expect(quotePonsBuy(1_000n, 1_000n, 1_000n, 0n, 100n, 0n, 0n).tokensOut).toBe(0n);
  });
});
