import { describe, expect, test } from "bun:test";
import { getChainConfig, publicChainConfig, UNISWAP_V3_FEES } from "../src/chains/config";

describe("Base and Robinhood Chain configuration", () => {
  test("publishes the supported chain IDs and verified Uniswap deployments", () => {
    const rhc = getChainConfig("rhc");
    const base = getChainConfig("base");
    expect(rhc?.chainId).toBe(4663);
    expect(base?.chainId).toBe(8453);
    expect(rhc?.uniswapV3.factory).toBe("0x1f7d7550b1b028f7571e69a784071f0205fd2efa");
    expect(base?.uniswapV3.factory).toBe("0x33128a8fc17869897dce68ed026d694621f6fdfd");
    expect(rhc?.uniswapV4.poolManager).toBe("0x8366a39cc670b4001a1121b8f6a443a643e40951");
    expect(base?.uniswapV4.poolManager).toBe("0x498581ff718922c3f8e6a244956af099b2652b2b");
    expect(rhc?.uniswapV4.universalRouter).toBe("0x8876789976decbfcbbbe364623c63652db8c0904");
    expect(base?.uniswapV4.universalRouter).toBe("0x6ff5693b99212da76ad316178a184ab56d299b43");
    expect(UNISWAP_V3_FEES).toEqual([100, 500, 3000, 10000]);
    for (const chain of [rhc!, base!]) {
      const addresses = [chain.wrappedNative, ...chain.quoteAssets.map((asset) => asset.address), ...Object.values(chain.uniswapV3), ...Object.values(chain.uniswapV4).filter(Boolean)];
      for (const address of addresses) expect(address).toMatch(/^0x[0-9a-f]{40}$/i);
    }
  });

  test("does not expose RPC URLs or private keys in public chain configuration", () => {
    const config = publicChainConfig(getChainConfig("rhc")!);
    expect(config.chainId).toBe(4663);
    expect(JSON.stringify(config)).not.toContain("RPC_URL");
    expect(JSON.stringify(config)).not.toContain("privateKey");
  });

  test("rejects other chains", () => {
    expect(getChainConfig("solana")).toBeUndefined();
    expect(getChainConfig("bnb")).toBeUndefined();
  });
});
