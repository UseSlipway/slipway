import { Router } from "express";
import { formatUnits, getAddress, isAddress, parseAbi, type Address } from "viem";
import { getChainConfig, getPublicClient } from "../chains/config";
import { db } from "../db/index";

export const ponsProgressRouter = Router();
const factory = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" as Address;
const zeroAddress = "0x0000000000000000000000000000000000000000";
const factoryAbi = parseAbi([
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "function getLaunchedToken(address token) view returns (LaunchedToken)"
]);
const curveAbi = parseAbi([
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)"
]);
const erc20Abi = parseAbi(["function decimals() view returns (uint8)"]);
const cacheTtlMs = 15_000;
const validPayload = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");

async function cachedProgress(token: string) {
  try {
    const result = await db.query<{ payload: unknown; fetched_at: Date }>(
      "SELECT payload, fetched_at FROM pons_progress_cache WHERE token_address = $1",
      [token.toLowerCase()]
    );
    const row = result.rows[0];
    if (row && Date.now() - new Date(row.fetched_at).getTime() < cacheTtlMs && validPayload(row.payload)) return row.payload;
  } catch { /* Serve live reads if the optional cache is unavailable. */ }
  return null;
}

async function readProgress(token: Address) {
  const config = getChainConfig("rhc")!;
  try {
    const client = getPublicClient(config);
    const launch = await client.readContract({ address: factory, abi: factoryAbi, functionName: "getLaunchedToken", args: [token] });
    if (!launch.exists) return { token, status: "not_pons" };
    if (launch.phase !== 0) return { token, status: "graduated", phase: Number(launch.phase) };
    if (launch.curve === zeroAddress || launch.graduationThreshold === 0n) return { token, status: "unavailable" };
    const [raised, threshold, decimals] = await Promise.all([
      client.readContract({ address: launch.curve, abi: curveAbi, functionName: "realQuoteReserve" }),
      client.readContract({ address: launch.curve, abi: curveAbi, functionName: "graduationThreshold" }),
      launch.pairToken === zeroAddress
        ? Promise.resolve(18)
        : client.readContract({ address: launch.pairToken, abi: erc20Abi, functionName: "decimals" })
    ]);
    if (threshold <= 0n) return { token, status: "unavailable" };
    const progressBps = Number((raised * 10_000n) / threshold);
    const quoteAsset = launch.pairToken === zeroAddress
      ? "ETH"
      : config.quoteAssets.find((asset) => asset.address.toLowerCase() === launch.pairToken.toLowerCase())?.symbol ?? launch.pairToken;
    return {
      token,
      status: "active",
      curve: launch.curve,
      quoteAsset,
      quoteDecimals: Number(decimals),
      raisedRaw: raised.toString(),
      thresholdRaw: threshold.toString(),
      raised: formatUnits(raised, Number(decimals)),
      threshold: formatUnits(threshold, Number(decimals)),
      progressBps,
      progressPercent: (progressBps / 100).toFixed(2)
    };
  } catch {
    return { token, status: "unavailable" };
  }
}

ponsProgressRouter.get("/progress", async (request, response) => {
  const raw = request.query.tokens;
  if (typeof raw !== "string" || raw.length > 1300) {
    response.status(400).json({ error: "Provide up to 24 Pons token addresses" });
    return;
  }
  const tokens = raw.split(",");
  if (!tokens.length || tokens.length > 24 || tokens.some((token) => !isAddress(token))) {
    response.status(400).json({ error: "Provide up to 24 valid EVM token addresses" });
    return;
  }
  const unique = [...new Map(tokens.map((token) => [token.toLowerCase(), getAddress(token)])).values()];
  try {
    const progress = await Promise.all(unique.map(async (token) => {
      const cached = await cachedProgress(token);
      if (cached) return cached;
      const result = await readProgress(token);
      if (result.status !== "unavailable") {
        await db.query(
          `INSERT INTO pons_progress_cache (token_address, payload, fetched_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (token_address) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
          [token.toLowerCase(), JSON.stringify(result)]
        ).catch(() => undefined);
      }
      return result;
    }));
    response.setHeader("Cache-Control", "no-store").json({ chain: "rhc", fetchedAt: new Date().toISOString(), items: progress });
  } catch {
    response.status(503).json({ error: "Pons graduation progress is temporarily unavailable" });
  }
});
