import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { decodeFunctionResult, encodeFunctionData, formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";
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
const erc20WriteAbi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;

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

    const opportunity = opportunities.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((a, b) => a.quoteIndex - b.quoteIndex || (a.amountOut > b.amountOut ? -1 : a.amountOut < b.amountOut ? 1 : a.fee - b.fee))[0];
    if (!opportunity) { response.status(404).json({ error: "No quotable Uniswap v3 pool found for this trade" }); return; }
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
      poolFee: opportunity.fee, venue: "uniswap-v3", priceImpactBps: null, slippageBps: input.slippageBps,
      feeLines: [
        { kind: "Slipway protocol fee", amount: formatUnits(protocolFee, inputDecimals), asset: inputSymbol, bps: PROTOCOL_FEE_BPS },
        { kind: "Uniswap v3 pool fee tier", amount: `${opportunity.fee / 10_000}%`, asset: "of swap input" }
      ],
      eligibility: { eligible: true, reason: null },
      simulation: { ok: true, method: "Uniswap v3 QuoterV2 eth_call", gasEstimate: opportunity.gasEstimate.toString() },
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
    const feeRouter = process.env[config.feeRouterEnv];
    if (!feeRouter || !isAddress(feeRouter)) { response.status(503).json({ error: "Fee router is not configured for this chain" }); return; }

    const tokenIn = getAddress(String(quote.inputToken));
    const tokenOut = getAddress(String(quote.outputToken));
    const amountIn = BigInt(String(quote.amountInRaw));
    const amountOutMin = BigInt(String(quote.amountOutMinRaw));
    const venueCall = encodeFunctionData({ abi: swapRouterAbi, functionName: "exactInputSingle", args: [{
      tokenIn, tokenOut, fee: Number(quote.poolFee), recipient: getAddress(feeRouter),
      deadline: BigInt(Math.floor(Date.now() / 1000) + 120), amountIn: BigInt(String(quote.venueAmountInRaw)),
      amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n
    }] });
    const feeCall = encodeFunctionData({ abi: feeRouterAbi, functionName: "executeExactIn", args: [{
      tokenIn, tokenOut, venue: config.uniswapV3.swapRouter, amountIn, amountOutMin,
      protocolFeeBps: PROTOCOL_FEE_BPS, integratorFeeBps: 0, integratorRecipient: ZERO_ADDRESS
    }, venueCall] });
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
