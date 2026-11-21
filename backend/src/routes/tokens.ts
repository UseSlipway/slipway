import { Router } from "express";
import { getAddress, isAddress, parseAbi, type Address } from "viem";
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
const ponsFactory = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" as Address;
const ponsLaunchLookupAbi = parseAbi([
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "function getLaunchedToken(address token) view returns (LaunchedToken)"
]);

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

    if (config.id === "rhc") {
      const launch = await client.readContract({
        address: ponsFactory,
        abi: ponsLaunchLookupAbi,
        functionName: "getLaunchedToken",
        args: [token]
      }).catch(() => null);
      if (launch?.exists) {
        const quoteAsset = launch.pairToken === "0x0000000000000000000000000000000000000000"
          ? "ETH"
          : config.quoteAssets.find((asset) => asset.address.toLowerCase() === launch.pairToken.toLowerCase())?.symbol ?? "—";
        response.setHeader("Cache-Control", "public, max-age=30").json({
          chain: config.id,
          chainId: config.chainId,
          token,
          name: metadata[2],
          symbol: metadata[1],
          decimals: metadata[0],
          venue: "pons-v2",
          venueBrand: "Pons",
          phase: launch.phase === 2 ? "CURVE_ACTIVE" : "PONS_LAUNCHED",
          quoteAsset,
          poolRef: { venue: "pons-v2", address: launch.curve, phase: Number(launch.phase) },
          source: "onchain",
          resolvedAt: new Date().toISOString()
        });
        return;
      }
    }

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

    const resolvedAt = new Date().toISOString();
    response.setHeader("Cache-Control", "public, max-age=5");
    if (!pool) {
      response.status(404).json({ error: "No supported liquid Uniswap v3 pool or recognized launch found for this token" });
      return;
    }

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
