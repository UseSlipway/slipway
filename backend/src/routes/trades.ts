import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, formatUnits, getAddress, isAddress, parseAbi, parseUnits, type Address } from "viem";
import { getChainConfig, getPublicClient, UNISWAP_V3_FEES, v3FactoryAbi, v3PoolAbi, erc20ReadAbi } from "../chains/config";

export const tradeRouter = Router();
const quoteSchema = z.object({ chain: z.enum(["rhc", "base"]), token: z.string().refine(isAddress), side: z.enum(["buy", "sell"]), amount: z.union([z.string(), z.number()]), amountType: z.literal("in").optional(), quoteAsset: z.string().optional(), slippageBps: z.number().int().min(0).max(5000) }).strict();
const amountSchema = z.string().regex(/^(?:\d+)(?:\.\d+)?$/).max(78);
const PROTOCOL_FEE_BPS = 20;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
export function calculateProtocolFee(amountIn: bigint): bigint { return amountIn * BigInt(PROTOCOL_FEE_BPS) / 10_000n; }
export function calculateMinimumOutput(amountOut: bigint, slippageBps: number): bigint { return amountOut * BigInt(10_000 - slippageBps) / 10_000n; }

const quoteAbi = [{ type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" }, { name: "sqrtPriceLimitX96", type: "uint160" }] }], outputs: [{ name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" }, { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" }] }] as const;
const swapRouterAbi = [{ type: "function", name: "exactInputSingle", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "fee", type: "uint24" }, { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" }] }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
const feeRouterAbi = [{ type: "function", name: "executeExactIn", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "venue", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "protocolFeeBps", type: "uint16" }, { name: "integratorFeeBps", type: "uint16" }, { name: "integratorRecipient", type: "address" }] }, { name: "venueCall", type: "bytes" }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
const feeRouterV2Abi = [{ type: "function", name: "executeExactInV4", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "venue", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "protocolFeeBps", type: "uint16" }, { name: "integratorFeeBps", type: "uint16" }, { name: "integratorRecipient", type: "address" }] }, { name: "permit2", type: "address" }, { name: "venueCall", type: "bytes" }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
const feeRouterV2NativeAbi = [{ type: "function", name: "executeExactInV4Native", stateMutability: "nonpayable", inputs: [{ name: "params", type: "tuple", components: [{ name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "venue", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "protocolFeeBps", type: "uint16" }, { name: "integratorFeeBps", type: "uint16" }, { name: "integratorRecipient", type: "address" }] }, { name: "permit2", type: "address" }, { name: "wrappedNative", type: "address" }, { name: "unwrapInput", type: "bool" }, { name: "wrapOutput", type: "bool" }, { name: "venueCall", type: "bytes" }], outputs: [{ name: "amountOut", type: "uint256" }] }] as const;
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
const ponsFactory = getAddress("0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e");
const ponsMemeHook = getAddress("0xe5e702641ea86f4ae6cc3cdaed2b886f976be044");

tradeRouter.post("/quote", async (request, response) => {
  const parsed = quoteSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid or unsupported trade quote request" }); return; }
  const input = parsed.data;
  const amountText = String(input.amount);
  if (!amountSchema.safeParse(amountText).success || Number(amountText) <= 0) { response.status(400).json({ error: "Trade amount must be a positive decimal string" }); return; }
  const config = getChainConfig(input.chain)!;
  const token = getAddress(input.token);
  const requestedQuoteAsset = input.quoteAsset?.trim().toUpperCase();
  const exactAsset = requestedQuoteAsset ? config.quoteAssets.find((asset) => asset.symbol.toUpperCase() === requestedQuoteAsset) : undefined;
  if (requestedQuoteAsset && !exactAsset) { response.status(400).json({ error: "Unsupported quote asset for this chain" }); return; }
  const quoteAssets = config.quoteAssets.filter((asset) => asset.address.toLowerCase() !== token.toLowerCase() && (!exactAsset || asset.address === exactAsset.address));
  if (!quoteAssets.length) { response.status(400).json({ error: "Token cannot be traded against the selected quote asset" }); return; }

  try {
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
    const protocolFee = calculateProtocolFee(grossAmount);
    const netAmount = grossAmount - protocolFee;
    if (netAmount <= 0n) { response.status(400).json({ error: "Trade amount is too small after the protocol fee" }); return; }

    const opportunities = await Promise.all(quoteAssets.flatMap((asset, quoteIndex) => UNISWAP_V3_FEES.map(async (fee) => {
      try {
        const tokenIn = input.side === "buy" ? asset.address : token;
        const tokenOut = input.side === "buy" ? token : asset.address;
        const pool = await client.readContract({ address: config.uniswapV3.factory, abi: v3FactoryAbi, functionName: "getPool", args: [tokenIn, tokenOut, fee] });
        if (pool === ZERO_ADDRESS) return null;
        const liquidity = await client.readContract({ address: pool, abi: v3PoolAbi, functionName: "liquidity" });
        if (liquidity === 0n) return null;
        const callData = encodeFunctionData({ abi: quoteAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn, tokenOut, amountIn: netAmount, fee, sqrtPriceLimitX96: 0n }] });
        const response = await client.call({ to: config.uniswapV3.quoter, data: callData });
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
          address: config.uniswapV4.quoter, abi: v4QuoteAbi, functionName: "quoteExactInputSingle",
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
            const result = await client.readContract({ address: config.uniswapV4.quoter, abi: v4QuoteAbi, functionName: "quoteExactInputSingle", args: [{ poolKey, zeroForOne, exactAmount: netAmount, hookData: "0x" }] });
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
            const result = await client.readContract({ address: config.uniswapV4.quoter, abi: v4QuoteAbi, functionName: "quoteExactInputSingle", args: [{ poolKey, zeroForOne, exactAmount: netAmount, hookData: "0x" }] });
            if (result[0] === 0n) return null;
            return { asset, quoteIndex: quoteAssets.indexOf(asset), fee: launch.poolFee, pool: "pons-v2-uniswap-v4", tokenIn, tokenOut, amountOut: result[0], gasEstimate: result[3], protocol: "uniswap-v4" as const, poolKey, zeroForOne, nativeInput: input.side === "buy", nativeOutput: input.side === "sell", ponsHookFeeBps: Number(feePolicy.hookFeeBps), ponsCreatorTaxBps: Number(launch.creatorTaxBps) };
          } catch { return null; }
        })()
      : null;
    const opportunity = [...opportunities, ...v4Opportunities, ...initializedV4Opportunities.flat(), ...(ponsOpportunity ? [ponsOpportunity] : [])].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((a, b) => a.quoteIndex - b.quoteIndex || (a.amountOut > b.amountOut ? -1 : a.amountOut < b.amountOut ? 1 : a.fee - b.fee))[0];
    if (!opportunity) { response.status(404).json({ error: "No quotable Uniswap v3 or v4 pool found for this trade" }); return; }
    const expiresAt = new Date(Date.now() + 30_000).toISOString();
    const amountOutMin = calculateMinimumOutput(opportunity.amountOut, input.slippageBps);
    if (amountOutMin === 0n) { response.status(400).json({ error: "Trade amount is too small to protect the minimum output" }); return; }
    const inputDecimals = input.side === "buy" ? opportunity.asset.decimals : decimals;
    const outputDecimals = input.side === "buy" ? decimals : opportunity.asset.decimals;
    const inputSymbol = input.side === "buy" ? opportunity.asset.symbol : String(symbol);
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
        { kind: `${"protocol" in opportunity ? "Uniswap v4" : "Uniswap v3"} pool fee tier`, amount: `${opportunity.fee / 10_000}%`, asset: "of swap input" },
        ...( "ponsHookFeeBps" in opportunity && Number(opportunity.ponsHookFeeBps) ? [{ kind: "Pons hook fee (included in quote)", amount: `${Number(opportunity.ponsHookFeeBps) / 100}%`, asset: inputSymbol }] : []),
        ...( "ponsCreatorTaxBps" in opportunity && Number(opportunity.ponsCreatorTaxBps) ? [{ kind: "Pons creator tax (included in quote)", amount: `${Number(opportunity.ponsCreatorTaxBps) / 100}%`, asset: inputSymbol }] : [])
      ],
      eligibility: { eligible: true, reason: null },
      simulation: { ok: true, method: `${"protocol" in opportunity ? "Uniswap v4 Quoter" : "Uniswap v3 QuoterV2"} eth_call`, gasEstimate: opportunity.gasEstimate.toString() },
      warnings: ["Pool and token behavior can change before your transaction is included."], expiresAt
    };

    const { db } = await import("../db/index");
    await db.query("DELETE FROM trade_quotes WHERE expires_at < now()");
    await db.query("INSERT INTO trade_quotes (id, chain, token_address, side, quote, expires_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)", [quote.id, config.id, token.toLowerCase(), input.side, JSON.stringify(quote), expiresAt]);
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
    const stored = await db.query<{ quote: Record<string, unknown>; expires_at: Date }>("SELECT quote, expires_at FROM trade_quotes WHERE id = $1", [parsed.data.quoteId]);
    const record = stored.rows[0];
    if (!record) { response.status(404).json({ error: "Quote not found or expired; request a fresh quote" }); return; }
    if (new Date(record.expires_at).getTime() <= Date.now()) { response.status(410).json({ error: "Quote expired; request a fresh quote" }); return; }

    const quote = record.quote;
    const config = getChainConfig(String(quote.chain === 4663 ? "rhc" : quote.chain === 8453 ? "base" : ""));
    if (!config) { response.status(400).json({ error: "Quote chain is unsupported" }); return; }
    const isV4 = quote.venue === "uniswap-v4";
    const feeRouter = process.env[isV4 ? config.feeRouterV2Env : config.feeRouterEnv];
    if (!feeRouter || !isAddress(feeRouter)) { response.status(503).json({ error: isV4 ? "Fee router v2 is not configured for this chain" : "Fee router is not configured for this chain" }); return; }

    const tokenIn = getAddress(String(quote.inputToken));
    const tokenOut = getAddress(String(quote.outputToken));
    const amountIn = BigInt(String(quote.amountInRaw));
    const amountOutMin = BigInt(String(quote.amountOutMinRaw));
    let feeCall: `0x${string}`;
    let approvalAddress = getAddress(feeRouter);
    if (isV4) {
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
        tokenIn, tokenOut, venue: config.uniswapV4.universalRouter, amountIn, amountOutMin,
        protocolFeeBps: PROTOCOL_FEE_BPS, integratorFeeBps: 0, integratorRecipient: ZERO_ADDRESS
      };
      feeCall = quote.nativeInput || quote.nativeOutput
        ? encodeFunctionData({ abi: feeRouterV2NativeAbi, functionName: "executeExactInV4Native", args: [exactInParams, config.uniswapV3.permit2, config.wrappedNative, Boolean(quote.nativeInput), Boolean(quote.nativeOutput), venueCall] })
        : encodeFunctionData({ abi: feeRouterV2Abi, functionName: "executeExactInV4", args: [exactInParams, config.uniswapV3.permit2, venueCall] });
    } else {
      const venueCall = encodeFunctionData({ abi: swapRouterAbi, functionName: "exactInputSingle", args: [{
        tokenIn, tokenOut, fee: Number(quote.poolFee), recipient: getAddress(feeRouter),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 120), amountIn: BigInt(String(quote.venueAmountInRaw)),
        amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n
      }] });
      feeCall = encodeFunctionData({ abi: feeRouterAbi, functionName: "executeExactIn", args: [{
        tokenIn, tokenOut, venue: config.uniswapV3.swapRouter, amountIn, amountOutMin,
        protocolFeeBps: PROTOCOL_FEE_BPS, integratorFeeBps: 0, integratorRecipient: ZERO_ADDRESS
      }, venueCall] });
    }
    const wallet = getAddress(parsed.data.wallet);
    response.setHeader("Cache-Control", "no-store");
    response.json({
      buildId: randomUUID(), quoteId: parsed.data.quoteId, chain: config.id, chainId: config.chainId,
      wallet, expiresAt: record.expires_at,
      payloads: [
        { kind: "evm_transaction", purpose: "approve_exact_input", chainId: config.chainId, from: wallet, to: tokenIn, value: "0x0", data: encodeFunctionData({ abi: erc20WriteAbi, functionName: "approve", args: [getAddress(feeRouter), amountIn] }) },
        { kind: "evm_transaction", purpose: "execute_trade_with_fee", chainId: config.chainId, from: wallet, to: getAddress(feeRouter), value: "0x0", data: feeCall }
      ]
    });
  } catch {
    response.status(503).json({ error: "Unsigned trade build is temporarily unavailable" });
  }
});
