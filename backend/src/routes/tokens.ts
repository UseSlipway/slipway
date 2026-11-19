import { Router } from "express";
import { getAddress, isAddress, type Address } from "viem";
import {
  erc20ReadAbi,
  getChainConfig,
  getPublicClient,
  UNISWAP_V3_FEES,
  v3FactoryAbi,
  v3PoolFeeAbi,
  v3PoolAbi
} from "../chains/config";

export const tokenRouter = Router();

tokenRouter.get("/:chain/:token", async (request, response) => {
  const config = getChainConfig(request.params.chain);
  const rawToken = request.params.token;
  if (!config || !isAddress(rawToken)) {
    response.status(400).json({ error: "Unsupported EVM chain or invalid token address" });
    return;
  }

  try {
    const client = getPublicClient(config);
    const [actualChainId, tokenCode] = await Promise.all([
      client.getChainId(),
      client.getCode({ address: getAddress(rawToken) })
    ]);
    if (actualChainId !== config.chainId) {
      response.status(503).json({ error: "Configured RPC chain ID mismatch" });
      return;
    }
    if (!tokenCode || tokenCode === "0x") {
      response.status(404).json({ error: "No token contract found at this address" });
      return;
    }

    const token = getAddress(rawToken);
    const metadata = await Promise.all([
      client.readContract({ address: token, abi: erc20ReadAbi, functionName: "decimals" }).catch(() => null),
      client.readContract({ address: token, abi: erc20ReadAbi, functionName: "symbol" }).catch(() => null),
      client.readContract({ address: token, abi: erc20ReadAbi, functionName: "name" }).catch(() => null)
    ]);

    const candidates = config.quoteAssets
      .filter((asset) => asset.address.toLowerCase() !== token.toLowerCase())
      .flatMap((asset, quoteIndex) => UNISWAP_V3_FEES.map((fee) => ({ asset, quoteIndex, fee })));
    const pools = await Promise.all(candidates.map(async (candidate) => {
      try {
        const address = await client.readContract({
          address: config.uniswapV3.factory,
          abi: v3FactoryAbi,
          functionName: "getPool",
          args: [token, candidate.asset.address, candidate.fee]
        });
        if (address === "0x0000000000000000000000000000000000000000") return null;
        const [liquidity, token0, token1, poolFee] = await Promise.all([
          client.readContract({ address, abi: v3PoolAbi, functionName: "liquidity" }),
          client.readContract({ address, abi: v3PoolAbi, functionName: "token0" }),
          client.readContract({ address, abi: v3PoolAbi, functionName: "token1" }),
          client.readContract({ address, abi: v3PoolFeeAbi, functionName: "fee" })
        ]);
        if (liquidity === 0n) return null;
        return { ...candidate, address, liquidity, token0, token1, poolFee };
      } catch {
        return null;
      }
    }));

    const pool = pools
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((a, b) => a.quoteIndex - b.quoteIndex || (a.liquidity > b.liquidity ? -1 : a.liquidity < b.liquidity ? 1 : 0))[0];

    if (!pool) {
      response.status(404).json({ error: "No supported liquid Uniswap v3 pool found for this token" });
      return;
    }

    const resolvedAt = new Date().toISOString();
    response.setHeader("Cache-Control", "public, max-age=5");
    response.json({
      chain: config.id,
      chainId: config.chainId,
      token,
      name: metadata[2],
      symbol: metadata[1],
      decimals: metadata[0],
      venue: "uniswap-v3",
      venueBrand: "Uniswap v3",
      phase: "POOL_LIVE",
      quoteAsset: pool.asset.symbol,
      poolRef: {
        venue: "uniswap-v3",
        address: pool.address,
        fee: pool.poolFee,
        token0: pool.token0,
        token1: pool.token1
      },
      source: "onchain",
      resolvedAt
    });
  } catch {
    response.status(503).json({ error: "Token resolution is temporarily unavailable" });
  }
});

export function isEvmAddress(value: string): value is Address {
  return isAddress(value);
}
