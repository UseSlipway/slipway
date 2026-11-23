import { describe, expect, test } from "bun:test";
import { legacyRouterFilters } from "../src/events/legacyRouterMonitor";

describe("legacy router activity filters", () => {
  test("scans router trade events and token transfers sent by either legacy router", () => {
    const [trade, transfer] = legacyRouterFilters(12_345n, 12_444n);

    expect(trade.fromBlock).toBe("0x3039");
    expect(trade.toBlock).toBe("0x309c");
    expect(trade.address).toEqual([
      "0x56d15a85d9f4ecec16c002dc5a02ef6b94c215c5",
      "0xe7635ad3fda4df9800b63cdcd164669d31a6fdca"
    ]);
    expect(trade.topics[0]).toBe("0xf356327e394eb6b6ba46b7ddfe8fd5db3b24d61a32b9260c971a77dd1ca1dff9");
    expect(transfer.address).toBeUndefined();
    expect(transfer.topics[0]).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
    expect(transfer.topics[1]).toEqual([
      "0x00000000000000000000000056d15a85d9f4ecec16c002dc5a02ef6b94c215c5",
      "0x000000000000000000000000e7635ad3fda4df9800b63cdcd164669d31a6fdca"
    ]);
  });
});
