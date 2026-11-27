import { Router } from "express";
import { recordTokenActivity } from "./trending";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, formatUnits, getAddress, isAddress, parseAbi, parseUnits, type Address } from "viem";
import { getChainConfig, getPublicClient, getRestrictedFeeRouterAddress, UNISWAP_V3_FEES, v3FactoryAbi, v3PoolAbi, erc20ReadAbi } from "../chains/config";
import { clientRateSubject, consumeDatabaseRateLimit } from "../middleware/rateLimit";

export const tradeRouter = Router();
// Trading uses the restricted routers deployed on both supported chains. Set the flag to
// "false" to pause trading without changing the deployment.
function tradingEnabled() { return process.env.SLIPWAY_TRADING_ENABLED !== "false"; }
const quoteSchema = z.object({ chain: z.enum(["rhc", "base", "spcx"]), token: z.string().refine(isAddress), side: z.enum(["buy", "sell"]), amount: z.union([z.string(), z.number()]), amountType: z.literal("in").optional(), quoteAsset: z.string().optional(), slippageBps: z.number().int().min(0).max(5000) }).strict();
const amountSchema = z.string().regex(/^(?:\d+)(?:\.\d+)?$/).max(78);
const PROTOCOL_FEE_BPS = 20;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
export function calculateProtocolFee(amountIn: bigint): bigint { return amountIn * BigInt(PROTOCOL_FEE_BPS) / 10_000n; }
export function calculateMinimumOutput(amountOut: bigint, slippageBps: number): bigint { return amountOut * BigInt(10_000 - slippageBps) / 10_000n; }

const quoteAbi = [{ type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" }, { name: "sqrtPriceLimitX96", type: "uint160" }] }], outputs: [{ name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" }, { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" }] }] as const;
const swapRouterAbi = [{ type: "function", name: "exactInputSingle", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "fee", type: "uint24" }, { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" }] }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
const feeRouterAbi = [{ type: "function", name: "executeExactIn", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "venue", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "protocolFeeBps", type: "uint16" }, { name: "integratorFeeBps", type: "uint16" }, { name: "integratorRecipient", type: "address" }] }, { name: "venueCall", type: "bytes" }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
const feeRouterV2Abi = [{ type: "function", name: "executeExactInV4", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "venue", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "protocolFeeBps", type: "uint16" }, { name: "integratorFeeBps", type: "uint16" }, { name: "integratorRecipient", type: "address" }] }, { name: "venueCall", type: "bytes" }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
const feeRouterV2NativeAbi = [{ type: "function", name: "executeExactInV4Native", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "venue", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "protocolFeeBps", type: "uint16" }, { name: "integratorFeeBps", type: "uint16" }, { name: "integratorRecipient", type: "address" }] }, { name: "unwrapInput", type: "bool" }, { name: "wrapOutput", type: "bool" }, { name: "venueCall", type: "bytes" }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
const feeRouterPonsNativeAbi = [{ type: "function", name: "executeExactInPonsNative", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "venue", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "protocolFeeBps", type: "uint16" }, { name: "integratorFeeBps", type: "uint16" }, { name: "integratorRecipient", type: "address" }] }, { name: "venueCall", type: "bytes" }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
const wethDepositAbi = [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }] as const;
const v4QuoteAbi = [{ type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "poolKey", type: "tuple", components: [{ name: "currency0", type: "address" }, { name: "currency1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }] }, { name: "zeroForOne", type: "bool" }, { name: "exactAmount", type: "uint128" }, { name: "hookData", type: "bytes" }] }], outputs: [{ name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" }, { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" }] }] as const;
const universalRouterV4Abi = [{ type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "commands", type: "bytes" }, { name: "inputs", type: "bytes[]" }, { name: "deadline", type: "uint256" }] }] as const;
const v4PoolKeyComponents = [{ name: "currency0", type: "address" }, { name: "currency1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }] as const;
const erc20WriteAbi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const ponsLaunchLookupAbi = parseAbi([
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "struct FeePolicy { address protocolFeeRecipient; uint16 protocolFeeShareBps; uint16 buybackBurnBps; uint16 hookFeeBps; uint16 maxInternalPriceImpactBps; }",
  "function getLaunchedToken(address token) view returns (LaunchedToken)",
  "function getLaunchFeePolicy(address token) view returns (FeePolicy)"
]);
const ponsCurveAbi = parseAbi([
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
  "function sellableTokens() view returns (uint256)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function currentSnipeTaxBps(address recipient) view returns (uint256)",
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)"
]);
const orbitFactoryAbi = parseAbi([
  "function isToken(address token) view returns (bool)",
  "function launches(address token) view returns (address creator,address pool,uint256 createdAt,string metadata)"
]);
const orbitCurveAbi = parseAbi([
  "function quoteBuy(uint256 spcxIn) view returns (uint256 tokensOut,uint256 netSPCX,uint256 creatorFee,uint256 protocolFee)",
  "function quoteSell(uint256 tokensIn) view returns (uint256 spcxOut,uint256 grossSPCX,uint256 creatorFee,uint256 protocolFee)",
  "function buy(address recipient,uint256 minimumTokens,uint256 deadline) payable",
  "function sell(uint256 tokensIn,uint256 minimumSPCX,address recipient,uint256 deadline)"
]);
const stoxFactoryAbi = parseAbi(["function getPair(address tokenA,address tokenB) view returns (address pair)"]);
const stoxPairAbi = parseAbi([
  "function token0() view returns (address)", "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)"
]);
const stoxRouterAbi = parseAbi([
  "function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)"
]);
const ponsFactory = getAddress("0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e");
const ponsMemeHook = getAddress("0xe5e702641ea86f4ae6cc3cdaed2b886f976be044");
const BPS = 10_000n;
function normalizeAddress(address: string): Address { return getAddress(address.toLowerCase()); }
function isAddressValue(address: string): boolean { return /^0x[a-fA-F0-9]{40}$/.test(address); }
export function tradeChainId(value: unknown): "rhc" | "base" | "spcx" | null {
  if (value === "rhc" || value === 4663) return "rhc";
  if (value === "base" || value === 8453) return "base";
  if (value === "spcx" || value === 46630022) return "spcx";
  return null;
}

export function quotePonsBuy(quoteIn: bigint, quoteReserve: bigint, tokenReserve: bigint, sellableTokens: bigint, feeBps: bigint, creatorTaxBps: bigint, rawSnipeBps: bigint) {
  if (quoteIn <= 0n || quoteReserve <= 0n || tokenReserve <= 0n || sellableTokens <= 0n) return { tokensOut: 0n, spent: 0n, snipeBps: 0n };
  let snipeBps = rawSnipeBps;
  if (snipeBps > 0n) {
    const maxSnipeBps = BPS - feeBps - creatorTaxBps - 100n;
    if (maxSnipeBps <= 0n) return { tokensOut: 0n, spent: 0n, snipeBps: 0n };
    if (snipeBps > maxSnipeBps) snipeBps = maxSnipeBps;
  }
  const fee = quoteIn * feeBps / BPS;
  const creatorTax = quoteIn * creatorTaxBps / BPS;
  const snipeTax = quoteIn * snipeBps / BPS;
  let tokensOut = ((quoteIn - fee - creatorTax - snipeTax) * tokenReserve) / (quoteReserve + quoteIn - fee - creatorTax - snipeTax);
  let spent = quoteIn;
  if (tokensOut > sellableTokens) {
    tokensOut = sellableTokens;
    const net = (sellableTokens * quoteReserve) / (tokenReserve - sellableTokens) + 1n;
    const totalFees = feeBps + creatorTaxBps + snipeBps;
    const grossed = (net * BPS + (BPS - totalFees) - 1n) / (BPS - totalFees);
    spent = grossed < quoteIn ? grossed : quoteIn;
  }
  return { tokensOut, spent, snipeBps };
}

tradeRouter.post("/quote", async (request, response) => {
  const parsed = quoteSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid or unsupported trade quote request" }); return; }
  const input = parsed.data;
  const amountText = String(input.amount);
  if (!amountSchema.safeParse(amountText).success || Number(amountText) <= 0) { response.status(400).json({ error: "Trade amount must be a positive decimal string" }); return; }
  const config = getChainConfig(input.chain)!;
  const token = getAddress(input.token);
  const requestedQuoteAsset = input.quoteAsset?.trim().toUpperCase();
  const exactAsset = requestedQuoteAsset ? config.quoteAssets.find((asset) => asset.symbol.toUpperCase() === requestedQuoteAsset)
    ?? (requestedQuoteAsset === "ETH" ? config.quoteAssets.find((asset) => asset.address.toLowerCase() === config.wrappedNative.toLowerCase()) : undefined) : undefined;
  if (requestedQuoteAsset && !exactAsset) { response.status(400).json({ error: "Unsupported quote asset for this chain" }); return; }
  const quoteAssets = config.quoteAssets.filter((asset) => asset.address.toLowerCase() !== token.toLowerCase() && (!exactAsset || asset.address === exactAsset.address));
  if (!quoteAssets.length) { response.status(400).json({ error: "Token cannot be traded against the selected quote asset" }); return; }
  if (!tradingEnabled() && config.id !== "spcx") { response.status(503).json({ error: "Trading is temporarily paused while the execution contracts are being upgraded" }); return; }

  try {
    if (await consumeDatabaseRateLimit("trade-quote", clientRateSubject(request), 30, 60)) {
      response.setHeader("Retry-After", "60").status(429).json({ error: "Too many trade quotes. Wait briefly and try again." }); return;
    }
    const client = getPublicClient(config);
    if (await client.getChainId() !== config.chainId) { response.status(503).json({ error: "Configured RPC chain ID mismatch" }); return; }
    const [tokenCode, decimals, symbol, name] = await Promise.all([
      client.getCode({ address: token }),
      client.readContract({ address: token, abi: erc20ReadAbi, functionName: "decimals" }),
      client.readContract({ address: token, abi: erc20ReadAbi, functionName: "symbol" }).catch(() => "TOKEN"),
      client.readContract({ address: token, abi: erc20ReadAbi, functionName: "name" }).catch(() => "Token")
    ]);
    if (!tokenCode || tokenCode === "0x") { response.status(404).json({ error: "No token contract found at this address" }); return; }

    const amountDecimals = input.side === "buy" ? quoteAssets[0]!.decimals : decimals;
    let grossAmount: bigint;
    try { grossAmount = parseUnits(amountText, amountDecimals); }
    catch { response.status(400).json({ error: "Trade amount has too many decimal places" }); return; }
    if (config.id === "spcx") {
      const settings = config.orbit && config.stoxswap;
      if (!settings) { response.status(503).json({ error: "SPCX trading venues are not configured" }); return; }
      const [isOrbitToken, launchInfo] = await Promise.all([
        client.readContract({ address: settings.factory, abi: orbitFactoryAbi, functionName: "isToken", args: [token] }),
        client.readContract({ address: settings.factory, abi: orbitFactoryAbi, functionName: "launches", args: [token] }).catch(() => null)
      ]);
      let venue = ""; let pool: Address | "" = ""; let amountOut = 0n; let gasEstimate = 0n; let feeDescription = "";
      if (isOrbitToken && launchInfo && launchInfo[1] !== ZERO_ADDRESS) {
        pool = launchInfo[1];
        if (input.side === "buy") {
          const q = await client.readContract({ address: pool, abi: orbitCurveAbi, functionName: "quoteBuy", args: [grossAmount] });
          amountOut = q[0];
          feeDescription = `Orbit curve fees (${formatUnits(q[2] + q[3], 18)} SPCX, included in quote)`;
        } else {
          const q = await client.readContract({ address: pool, abi: orbitCurveAbi, functionName: "quoteSell", args: [grossAmount] });
          amountOut = q[0];
          feeDescription = `Orbit curve fees (${formatUnits(q[2] + q[3], 18)} SPCX, included in quote)`;
        }
        venue = "orbit-curve";
      } else {
        const pair = await client.readContract({ address: settings.factory, abi: stoxFactoryAbi, functionName: "getPair", args: [token, settings.wrappedNative] });
        if (pair !== ZERO_ADDRESS) {
          const [token0, reserves] = await Promise.all([
            client.readContract({ address: pair, abi: stoxPairAbi, functionName: "token0" }),
            client.readContract({ address: pair, abi: stoxPairAbi, functionName: "getReserves" })
          ]);
          const tokenIs0 = token0.toLowerCase() === token.toLowerCase();
          const reserveToken = tokenIs0 ? reserves[0] : reserves[1];
          const reserveNative = tokenIs0 ? reserves[1] : reserves[0];
          const reserveIn = input.side === "buy" ? reserveNative : reserveToken;
          const reserveOut = input.side === "buy" ? reserveToken : reserveNative;
          const amountWithFee = grossAmount * 997n;
          amountOut = reserveIn && reserveOut ? amountWithFee * reserveOut / (reserveIn * 1000n + amountWithFee) : 0n;
          pool = pair; venue = "stoxswap-v2"; feeDescription = "StoxSwap pool fee (0.30%, included in quote)";
        }
      }
      if (!venue || amountOut <= 0n) { response.status(404).json({ error: "No quotable Orbit curve or StoxSwap pool found for this token" }); return; }
      const amountOutMin = calculateMinimumOutput(amountOut, input.slippageBps);
      if (amountOutMin <= 0n) { response.status(400).json({ error: "Trade amount is too small to protect the minimum output" }); return; }
      const expiresAt = new Date(Date.now() + 30_000).toISOString();
      const inputDecimals = input.side === "buy" ? 18 : decimals;
      const outputDecimals = input.side === "buy" ? decimals : 18;
      const quote = {
        id: randomUUID(), chain: "spcx", chainId: config.chainId, token, tokenName: name, tokenSymbol: symbol,
        side: input.side, amountIn: amountText, amountInRaw: grossAmount.toString(), venueAmountInRaw: grossAmount.toString(),
        expectedOut: formatUnits(amountOut, outputDecimals), minOut: formatUnits(amountOutMin, outputDecimals),
        amountOutRaw: amountOut.toString(), amountOutMinRaw: amountOutMin.toString(),
        assetIn: input.side === "buy" ? "SPCX" : String(symbol), assetOut: input.side === "buy" ? String(symbol) : "SPCX",
        inputToken: input.side === "buy" ? settings.wrappedNative : token, outputToken: input.side === "buy" ? token : settings.wrappedNative,
        inputDecimals, outputDecimals, inputSymbol: input.side === "buy" ? "SPCX" : String(symbol), outputSymbol: input.side === "buy" ? String(symbol) : "SPCX",
        quoteAsset: "SPCX", pool, poolFee: venue === "stoxswap-v2" ? 30 : 0, venue, priceImpactBps: null, slippageBps: input.slippageBps,
        feeLines: [{ kind: feeDescription, amount: "included", asset: "SPCX" }], eligibility: { eligible: true, reason: null },
        simulation: { ok: true, method: venue === "orbit-curve" ? "Orbit curve quote" : "StoxSwap V2 reserve quote", gasEstimate: gasEstimate.toString() },
        warnings: ["SPCX trades execute directly against the selected venue; Slipway does not take a protocol fee on this chain."], expiresAt
      };
      const { db } = await import("../db/index");
      await db.query("DELETE FROM trade_quotes WHERE expires_at < now()");
      await db.query("INSERT INTO trade_quotes (id, chain, token_address, side, quote, expires_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)", [quote.id, config.id, token.toLowerCase(), input.side, JSON.stringify(quote), expiresAt]);
      response.setHeader("Cache-Control", "no-store").json(quote);
      return;
    }
    const protocolFee = calculateProtocolFee(grossAmount);
    const netAmount = grossAmount - protocolFee;
    if (netAmount <= 0n) { response.status(400).json({ error: "Trade amount is too small after the protocol fee" }); return; }

    const opportunities = await Promise.all(quoteAssets.flatMap((asset, quoteIndex) => UNISWAP_V3_FEES.map(async (fee) => {
      try {
        const tokenIn = input.side === "buy" ? asset.address : token;
        const tokenOut = input.side === "buy" ? token : asset.address;
        const pool = await client.readContract({ address: config.uniswapV3!.factory, abi: v3FactoryAbi, functionName: "getPool", args: [tokenIn, tokenOut, fee] });
        if (pool === ZERO_ADDRESS) return null;
        const liquidity = await client.readContract({ address: pool, abi: v3PoolAbi, functionName: "liquidity" });
        if (liquidity === 0n) return null;
        const callData = encodeFunctionData({ abi: quoteAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn, tokenOut, amountIn: netAmount, fee, sqrtPriceLimitX96: 0n }] });
        const response = await client.call({ to: config.uniswapV3!.quoter, data: callData });
        if (!response.data) return null;
        const result = decodeFunctionResult({ abi: quoteAbi, functionName: "quoteExactInputSingle", data: response.data });
        const amountOut = result[0] as bigint;
        const gasEstimate = result[3] as bigint;
        if (amountOut === 0n) return null;
        return { asset, quoteIndex, fee, pool, tokenIn, tokenOut, liquidity, amountOut, gasEstimate };
      } catch { return null; }
    })));

    const v4Opportunities = await Promise.all(quoteAssets.flatMap((asset, quoteIndex) => [100, 500, 3000, 10000].map(async (fee) => {
      try {
        if (netAmount > (1n << 128n) - 1n) return null;
        const tokenIn = input.side === "buy" ? asset.address : token;
        const tokenOut = input.side === "buy" ? token : asset.address;
        const [currency0, currency1] = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? [tokenIn, tokenOut] : [tokenOut, tokenIn];
        const tickSpacing = fee === 100 ? 1 : fee === 500 ? 10 : fee === 3000 ? 60 : 200;
        const poolKey = { currency0, currency1, fee, tickSpacing, hooks: ZERO_ADDRESS };
        const zeroForOne = tokenIn.toLowerCase() === currency0.toLowerCase();
        const result = await client.readContract({
          address: config.uniswapV4!.quoter, abi: v4QuoteAbi, functionName: "quoteExactInputSingle",
          args: [{ poolKey, zeroForOne, exactAmount: netAmount, hookData: "0x" }]
        });
        if (result[0] === 0n) return null;
        return { asset, quoteIndex, fee, pool: "uniswap-v4-singleton", tokenIn, tokenOut, amountOut: result[0], gasEstimate: result[3], protocol: "uniswap-v4" as const, poolKey, zeroForOne, nativeInput: false, nativeOutput: false };
      } catch { return null; }
    })));
    const initializedV4Opportunities = await Promise.all(quoteAssets.map(async (asset, quoteIndex) => {
      try {
        const { db } = await import("../db/index");
        const tokenAddress = token.toLowerCase();
        const assetAddress = asset.address.toLowerCase();
        const pools = await db.query<{ payload: { args?: Record<string, string | number> } }>(
          `SELECT payload FROM chain_events
           WHERE chain = $1 AND event_type = 'pool.initialized'
             AND ((lower(payload->'args'->>'currency0') = $2 AND lower(payload->'args'->>'currency1') = $3)
               OR (lower(payload->'args'->>'currency0') = $3 AND lower(payload->'args'->>'currency1') = $2))
           ORDER BY id DESC LIMIT 12`, [config.id, tokenAddress, assetAddress]
        );
        const tokenIn = input.side === "buy" ? asset.address : token;
        const tokenOut = input.side === "buy" ? token : asset.address;
        return await Promise.all(pools.rows.map(async ({ payload }) => {
          try {
            const args = payload.args;
            if (!args?.currency0 || !args.currency1 || !args.hooks || args.fee === undefined || args.tickSpacing === undefined) return null;
            const poolKey = { currency0: getAddress(String(args.currency0)), currency1: getAddress(String(args.currency1)), fee: Number(args.fee), tickSpacing: Number(args.tickSpacing), hooks: getAddress(String(args.hooks)) };
            const zeroForOne = tokenIn.toLowerCase() === poolKey.currency0.toLowerCase();
            const result = await client.readContract({ address: config.uniswapV4!.quoter, abi: v4QuoteAbi, functionName: "quoteExactInputSingle", args: [{ poolKey, zeroForOne, exactAmount: netAmount, hookData: "0x" }] });
            if (result[0] === 0n) return null;
            const nativeInput = (zeroForOne ? poolKey.currency0 : poolKey.currency1) === ZERO_ADDRESS && tokenIn.toLowerCase() === config.wrappedNative.toLowerCase();
            const nativeOutput = (zeroForOne ? poolKey.currency1 : poolKey.currency0) === ZERO_ADDRESS && tokenOut.toLowerCase() === config.wrappedNative.toLowerCase();
            return { asset, quoteIndex, fee: poolKey.fee, pool: "uniswap-v4-indexed", tokenIn, tokenOut, amountOut: result[0], gasEstimate: result[3], protocol: "uniswap-v4" as const, poolKey, zeroForOne, nativeInput, nativeOutput };
          } catch { return null; }
        }));
      } catch { return []; }
    }));
    const ponsOpportunity = config.id === "rhc" && netAmount <= (1n << 128n) - 1n && quoteAssets.some((asset) => asset.address.toLowerCase() === config.wrappedNative.toLowerCase())
      ? await (async () => {
          try {
            const launch = await client.readContract({ address: ponsFactory, abi: ponsLaunchLookupAbi, functionName: "getLaunchedToken", args: [token] });
            if (!launch.exists || launch.phase !== 2 || launch.pairToken !== ZERO_ADDRESS) return null;
            const feePolicy = await client.readContract({ address: ponsFactory, abi: ponsLaunchLookupAbi, functionName: "getLaunchFeePolicy", args: [token] });
            const asset = quoteAssets.find((candidate) => candidate.address.toLowerCase() === config.wrappedNative.toLowerCase())!;
            const tokenIn = input.side === "buy" ? asset.address : token;
            const tokenOut = input.side === "buy" ? token : asset.address;
            const [currency0, currency1] = [ZERO_ADDRESS, token];
            const poolKey = { currency0, currency1, fee: launch.poolFee, tickSpacing: Number(launch.tickSpacing), hooks: ponsMemeHook };
            const zeroForOne = input.side === "buy";
            const result = await client.readContract({ address: config.uniswapV4!.quoter, abi: v4QuoteAbi, functionName: "quoteExactInputSingle", args: [{ poolKey, zeroForOne, exactAmount: netAmount, hookData: "0x" }] });
            if (result[0] === 0n) return null;
            return { asset, quoteIndex: quoteAssets.indexOf(asset), fee: launch.poolFee, pool: "pons-v2-uniswap-v4", tokenIn, tokenOut, amountOut: result[0], gasEstimate: result[3], protocol: "uniswap-v4" as const, poolKey, zeroForOne, nativeInput: input.side === "buy", nativeOutput: input.side === "sell", ponsHookFeeBps: Number(feePolicy.hookFeeBps), ponsCreatorTaxBps: Number(launch.creatorTaxBps) };
          } catch { return null; }
        })()
      : null;
    const ponsCurveOpportunity = config.id === "rhc" && input.side === "buy" && quoteAssets.some((asset) => asset.address.toLowerCase() === config.wrappedNative.toLowerCase())
      ? await (async () => {
          try {
            const launch = await client.readContract({ address: ponsFactory, abi: ponsLaunchLookupAbi, functionName: "getLaunchedToken", args: [token] });
            if (!launch.exists || launch.phase !== 0 || launch.pairToken !== ZERO_ADDRESS || launch.curve === ZERO_ADDRESS) return null;
            const feeRouter = getRestrictedFeeRouterAddress(config);
            const curve = launch.curve;
            const [reserves, sellableTokens, feeBps, creatorTaxBps, rawSnipeBps] = await Promise.all([
              client.readContract({ address: curve, abi: ponsCurveAbi, functionName: "getReserves" }),
              client.readContract({ address: curve, abi: ponsCurveAbi, functionName: "sellableTokens" }),
              client.readContract({ address: curve, abi: ponsCurveAbi, functionName: "feeBps" }),
              client.readContract({ address: curve, abi: ponsCurveAbi, functionName: "creatorTaxBps" }),
              client.readContract({ address: curve, abi: ponsCurveAbi, functionName: "currentSnipeTaxBps", args: [normalizeAddress(feeRouter)] })
            ]);
            const asset = quoteAssets.find((candidate) => candidate.address.toLowerCase() === config.wrappedNative.toLowerCase())!;
            const curveQuote = quotePonsBuy(netAmount, reserves[0], reserves[1], sellableTokens, feeBps, creatorTaxBps, rawSnipeBps);
            if (curveQuote.tokensOut === 0n) return null;
            return {
              asset, quoteIndex: quoteAssets.indexOf(asset), fee: 0, pool: curve, tokenIn: asset.address, tokenOut: token,
              amountOut: curveQuote.tokensOut, gasEstimate: 0n, protocol: "pons-curve" as const,
              nativeInput: true, nativeOutput: false, ponsCurveFeeBps: Number(feeBps),
              ponsCreatorTaxBps: Number(creatorTaxBps), ponsSnipeTaxBps: Number(curveQuote.snipeBps),
              quoteSymbol: "ETH"
            };
          } catch { return null; }
        })()
      : null;
    const opportunity = [...opportunities, ...v4Opportunities, ...initializedV4Opportunities.flat(), ...(ponsOpportunity ? [ponsOpportunity] : []), ...(ponsCurveOpportunity ? [ponsCurveOpportunity] : [])].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((a, b) => a.quoteIndex - b.quoteIndex || (a.amountOut > b.amountOut ? -1 : a.amountOut < b.amountOut ? 1 : a.fee - b.fee))[0];
    if (!opportunity) { response.status(404).json({ error: "No quotable Pons curve or Uniswap v3/v4 route found for this trade" }); return; }
    const expiresAt = new Date(Date.now() + 30_000).toISOString();
    const amountOutMin = calculateMinimumOutput(opportunity.amountOut, input.slippageBps);
    if (amountOutMin === 0n) { response.status(400).json({ error: "Trade amount is too small to protect the minimum output" }); return; }
    const inputDecimals = input.side === "buy" ? opportunity.asset.decimals : decimals;
    const outputDecimals = input.side === "buy" ? decimals : opportunity.asset.decimals;
    const inputSymbol = input.side === "buy" ? ("quoteSymbol" in opportunity ? opportunity.quoteSymbol : opportunity.asset.symbol) : String(symbol);
    const outputSymbol = input.side === "buy" ? String(symbol) : opportunity.asset.symbol;
    const quote = {
      id: randomUUID(), chain: config.id, chainId: config.chainId, token, tokenName: name, tokenSymbol: symbol,
      side: input.side, amountIn: amountText, amountInRaw: grossAmount.toString(), venueAmountInRaw: netAmount.toString(),
      expectedOut: formatUnits(opportunity.amountOut, outputDecimals), minOut: formatUnits(amountOutMin, outputDecimals),
      amountOutRaw: opportunity.amountOut.toString(), amountOutMinRaw: amountOutMin.toString(),
      assetIn: inputSymbol, assetOut: outputSymbol, inputToken: opportunity.tokenIn, outputToken: opportunity.tokenOut,
      inputDecimals, outputDecimals, inputSymbol, outputSymbol, quoteAsset: opportunity.asset.symbol, pool: opportunity.pool,
      poolFee: opportunity.fee, venue: "protocol" in opportunity ? opportunity.protocol : "uniswap-v3",
      poolKey: "poolKey" in opportunity ? opportunity.poolKey : undefined, zeroForOne: "zeroForOne" in opportunity ? opportunity.zeroForOne : undefined,
      nativeInput: "nativeInput" in opportunity ? opportunity.nativeInput : undefined, nativeOutput: "nativeOutput" in opportunity ? opportunity.nativeOutput : undefined,
      priceImpactBps: null, slippageBps: input.slippageBps,
      feeLines: [
        { kind: "Slipway protocol fee", amount: formatUnits(protocolFee, inputDecimals), asset: inputSymbol, bps: PROTOCOL_FEE_BPS },
        ...( "ponsCurveFeeBps" in opportunity ? [
          { kind: "Pons curve fee (included in quote)", amount: `${Number(opportunity.ponsCurveFeeBps) / 100}%`, asset: inputSymbol },
          ...(Number(opportunity.ponsCreatorTaxBps) ? [{ kind: "Pons creator tax (included in quote)", amount: `${Number(opportunity.ponsCreatorTaxBps) / 100}%`, asset: inputSymbol }] : []),
          ...(Number(opportunity.ponsSnipeTaxBps) ? [{ kind: "Pons opening tax (included in quote)", amount: `${Number(opportunity.ponsSnipeTaxBps) / 100}%`, asset: inputSymbol }] : [])
        ] : [{ kind: `${"protocol" in opportunity ? "Uniswap v4" : "Uniswap v3"} pool fee tier`, amount: `${opportunity.fee / 10_000}%`, asset: "of swap input" }]),
        ...( "ponsHookFeeBps" in opportunity && Number(opportunity.ponsHookFeeBps) ? [{ kind: "Pons hook fee (included in quote)", amount: `${Number(opportunity.ponsHookFeeBps) / 100}%`, asset: inputSymbol }] : []),
        ...( !("ponsCurveFeeBps" in opportunity) && "ponsCreatorTaxBps" in opportunity && Number(opportunity.ponsCreatorTaxBps) ? [{ kind: "Pons creator tax (included in quote)", amount: `${Number(opportunity.ponsCreatorTaxBps) / 100}%`, asset: inputSymbol }] : [])
      ],
      eligibility: { eligible: true, reason: null },
      simulation: { ok: true, method: "ponsCurveFeeBps" in opportunity ? "Pons bonding-curve reserves" : `${"protocol" in opportunity ? "Uniswap v4 Quoter" : "Uniswap v3 QuoterV2"} eth_call`, gasEstimate: opportunity.gasEstimate.toString() },
      warnings: ["Pool and token behavior can change before your transaction is included."], expiresAt
    };

    const { db } = await import("../db/index");
    await db.query("DELETE FROM trade_quotes WHERE expires_at < now()");
    await db.query("INSERT INTO trade_quotes (id, chain, token_address, side, quote, expires_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)", [quote.id, config.id, token.toLowerCase(), input.side, JSON.stringify(quote), expiresAt]);
    void recordTokenActivity(config.id, token, "quote");
    response.setHeader("Cache-Control", "no-store");
    response.json(quote);
  } catch {
    response.status(503).json({ error: "Trade quote is temporarily unavailable" });
  }
});

tradeRouter.post("/build/trade", async (request, response) => {
  const parsed = z.object({ quoteId: z.string().uuid(), wallet: z.string().refine(isAddress), accountKind: z.literal("eoa") }).strict().safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid unsigned trade build request" }); return; }
  try {
    const { db } = await import("../db/index");
    if (!tradingEnabled()) {
      const chain = await db.query<{ chain: string }>("SELECT chain FROM trade_quotes WHERE id = $1", [parsed.data.quoteId]);
      if (chain.rows[0]?.chain !== "spcx") { response.status(503).json({ error: "Trading is temporarily paused while the execution contracts are being upgraded" }); return; }
    }
    const stored = await db.query<{ quote: Record<string, unknown>; expires_at: Date }>("SELECT quote, expires_at FROM trade_quotes WHERE id = $1", [parsed.data.quoteId]);
    const record = stored.rows[0];
    if (!record) { response.status(404).json({ error: "Quote not found or expired; request a fresh quote" }); return; }
    if (new Date(record.expires_at).getTime() <= Date.now()) { response.status(410).json({ error: "Quote expired; request a fresh quote" }); return; }

    const quote = record.quote;
    const config = getChainConfig(tradeChainId(quote.chain) ?? "");
    if (!config) { response.status(400).json({ error: "Quote chain is unsupported" }); return; }
    if (!tradingEnabled() && config.id !== "spcx") { response.status(503).json({ error: "Trading is temporarily paused while the execution contracts are being upgraded" }); return; }
    const wallet = getAddress(parsed.data.wallet);
    if (config.id === "spcx") {
      const token = getAddress(String(quote.token));
      const amountIn = BigInt(String(quote.amountInRaw));
      const amountOutMin = BigInt(String(quote.amountOutMinRaw));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
      const payloads: Array<Record<string, string | number>> = [];
      if (quote.venue === "orbit-curve") {
        const curve = getAddress(String(quote.pool));
        if (quote.side === "buy") {
          payloads.push({ kind: "evm_transaction", purpose: "buy_on_orbit_curve", chainId: config.chainId, from: wallet, to: curve, value: `0x${amountIn.toString(16)}`, data: encodeFunctionData({ abi: orbitCurveAbi, functionName: "buy", args: [wallet, amountOutMin, deadline] }) });
        } else {
          payloads.push({ kind: "evm_transaction", purpose: "approve_orbit_curve", chainId: config.chainId, from: wallet, to: token, value: "0x0", data: encodeFunctionData({ abi: erc20WriteAbi, functionName: "approve", args: [curve, amountIn] }) });
          payloads.push({ kind: "evm_transaction", purpose: "sell_on_orbit_curve", chainId: config.chainId, from: wallet, to: curve, value: "0x0", data: encodeFunctionData({ abi: orbitCurveAbi, functionName: "sell", args: [amountIn, amountOutMin, wallet, deadline] }) });
        }
      } else if (quote.venue === "stoxswap-v2" && config.stoxswap) {
        const path = quote.side === "buy" ? [config.stoxswap.wrappedNative, token] : [token, config.stoxswap.wrappedNative];
        if (quote.side === "buy") {
          payloads.push({ kind: "evm_transaction", purpose: "buy_on_stoxswap", chainId: config.chainId, from: wallet, to: config.stoxswap.router, value: `0x${amountIn.toString(16)}`, data: encodeFunctionData({ abi: stoxRouterAbi, functionName: "swapExactETHForTokens", args: [amountOutMin, path, wallet, deadline] }) });
        } else {
          payloads.push({ kind: "evm_transaction", purpose: "approve_stoxswap", chainId: config.chainId, from: wallet, to: token, value: "0x0", data: encodeFunctionData({ abi: erc20WriteAbi, functionName: "approve", args: [config.stoxswap.router, amountIn] }) });
          payloads.push({ kind: "evm_transaction", purpose: "sell_on_stoxswap", chainId: config.chainId, from: wallet, to: config.stoxswap.router, value: "0x0", data: encodeFunctionData({ abi: stoxRouterAbi, functionName: "swapExactTokensForETH", args: [amountIn, amountOutMin, path, wallet, deadline] }) });
        }
      } else { response.status(400).json({ error: "Unsupported SPCX trade venue" }); return; }
      response.setHeader("Cache-Control", "no-store").json({ buildId: randomUUID(), quoteId: parsed.data.quoteId, chain: config.id, chainId: config.chainId, wallet, expiresAt: record.expires_at, payloads });
      return;
    }
    const isPonsCurve = quote.venue === "pons-curve";
    const isV4 = quote.venue === "uniswap-v4";
    const feeRouter = getRestrictedFeeRouterAddress(config);
    if (!isAddressValue(feeRouter)) { response.status(503).json({ error: "Restricted fee router configuration is invalid" }); return; }

    const tokenIn = getAddress(String(quote.inputToken));
    const tokenOut = getAddress(String(quote.outputToken));
    const amountIn = BigInt(String(quote.amountInRaw));
    const amountOutMin = BigInt(String(quote.amountOutMinRaw));
    let feeCall: `0x${string}`;
    if (isPonsCurve) {
      const venueAmount = BigInt(String(quote.venueAmountInRaw));
      const venueCall = encodeFunctionData({ abi: ponsCurveAbi, functionName: "buy", args: [venueAmount, amountOutMin, normalizeAddress(feeRouter)] });
      const exactInParams = {
        tokenIn, tokenOut, venue: getAddress(String(quote.pool)), amountIn, amountOutMin,
        protocolFeeBps: PROTOCOL_FEE_BPS, integratorFeeBps: 0, integratorRecipient: ZERO_ADDRESS
      };
      feeCall = encodeFunctionData({ abi: feeRouterPonsNativeAbi, functionName: "executeExactInPonsNative", args: [exactInParams, venueCall] });
    } else if (isV4) {
      const poolKey = quote.poolKey as { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
      const venueAmount = BigInt(String(quote.venueAmountInRaw));
      const amountOutMinimumV4 = amountOutMin;
      const currencyIn = Boolean(quote.zeroForOne) ? poolKey.currency0 : poolKey.currency1;
      const currencyOut = Boolean(quote.zeroForOne) ? poolKey.currency1 : poolKey.currency0;
      const actions = "0x060c0f" as `0x${string}`;
      const actionParams = [
        encodeAbiParameters([{ type: "tuple", components: v4PoolKeyComponents }, { type: "bool" }, { type: "uint128" }, { type: "uint128" }, { type: "bytes" }], [poolKey, Boolean(quote.zeroForOne), venueAmount, amountOutMinimumV4, "0x"]),
        encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyIn, venueAmount]),
        encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyOut, amountOutMinimumV4])
      ];
      const v4SwapInput = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, actionParams]);
      const venueCall = encodeFunctionData({ abi: universalRouterV4Abi, functionName: "execute", args: ["0x10", [v4SwapInput], BigInt(Math.floor(Date.now() / 1000) + 120)] });
      const exactInParams = {
        tokenIn, tokenOut, venue: config.uniswapV4!.universalRouter, amountIn, amountOutMin,
        protocolFeeBps: PROTOCOL_FEE_BPS, integratorFeeBps: 0, integratorRecipient: ZERO_ADDRESS
      };
      feeCall = quote.nativeInput || quote.nativeOutput
        ? encodeFunctionData({ abi: feeRouterV2NativeAbi, functionName: "executeExactInV4Native", args: [exactInParams, Boolean(quote.nativeInput), Boolean(quote.nativeOutput), venueCall] })
        : encodeFunctionData({ abi: feeRouterV2Abi, functionName: "executeExactInV4", args: [exactInParams, venueCall] });
    } else {
      const venueCall = encodeFunctionData({ abi: swapRouterAbi, functionName: "exactInputSingle", args: [{
        tokenIn, tokenOut, fee: Number(quote.poolFee), recipient: normalizeAddress(feeRouter),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 120), amountIn: BigInt(String(quote.venueAmountInRaw)),
        amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n
      }] });
      feeCall = encodeFunctionData({ abi: feeRouterAbi, functionName: "executeExactIn", args: [{
        tokenIn, tokenOut, venue: config.uniswapV3!.swapRouter, amountIn, amountOutMin,
        protocolFeeBps: PROTOCOL_FEE_BPS, integratorFeeBps: 0, integratorRecipient: ZERO_ADDRESS
      }, venueCall] });
    }
    response.setHeader("Cache-Control", "no-store");
    const payloads = [
        ...(isPonsCurve ? [{ kind: "evm_transaction", purpose: "wrap_native_input", chainId: config.chainId, from: wallet, to: config.wrappedNative, value: `0x${amountIn.toString(16)}`, data: encodeFunctionData({ abi: wethDepositAbi, functionName: "deposit" }) }] : []),
        { kind: "evm_transaction", purpose: "approve_exact_input", chainId: config.chainId, from: wallet, to: tokenIn, value: "0x0", data: encodeFunctionData({ abi: erc20WriteAbi, functionName: "approve", args: [normalizeAddress(feeRouter), amountIn] }) },
        { kind: "evm_transaction", purpose: "execute_trade_with_fee", chainId: config.chainId, from: wallet, to: normalizeAddress(feeRouter), value: "0x0", data: feeCall }
      ];
    if (typeof quote.token === "string") void recordTokenActivity(config.id, quote.token, "build");
    response.json({
      buildId: randomUUID(), quoteId: parsed.data.quoteId, chain: config.id, chainId: config.chainId,
      wallet, expiresAt: record.expires_at,
      payloads
    });
  } catch {
    response.status(503).json({ error: "Unsigned trade build is temporarily unavailable" });
  }
});
