import { Router } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { Clanker } from "clanker-sdk/v4";
import { encodeFunctionData, formatEther, getAddress, isAddress, parseAbi, zeroAddress } from "viem";
import { z } from "zod";
import { getChainConfig, getPublicClient } from "../chains/config";
import { clientRateSubject, consumeDatabaseRateLimit } from "../middleware/rateLimit";
import { db } from "../db/index";

export const launchRouter = Router();
const ponsFactory = getAddress("0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e");
const launchAbi = parseAbi([
  "struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "function canLaunch(address account) view returns (bool)",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
  "function launchFee() view returns (uint256)",
  "function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)"
]);
const quoteSchema = z.object({
  venue: z.enum(["pons", "clanker-v4"]), chain: z.union([z.literal(4663), z.literal(8453)]), wallet: z.string().refine(isAddress),
  name: z.string().trim().min(1).max(32), symbol: z.string().trim().regex(/^[a-zA-Z0-9]{1,10}$/),
  metadataUri: z.string().trim().min(1).max(2048).regex(/^(ipfs:\/\/|https:\/\/)/i),
  description: z.string().max(256).optional(), website: z.string().max(256).optional(), telegram: z.string().max(256).optional(), x: z.string().max(256).optional(),
  devBuy: z.string().optional()
}).strict();

function chainFor(chainId: number) { return chainId === 4663 ? "rhc" : "base"; }

launchRouter.post("/launch/quote", async (request, response) => {
  const parsed = quoteSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid launch quote request" }); return; }
  const input = parsed.data;
  if ((input.venue === "pons" && input.chain !== 4663) || (input.venue === "clanker-v4" && input.chain !== 8453)) {
    response.status(400).json({ error: "Launch venue is not available on the selected chain" }); return;
  }
  if (input.devBuy && input.devBuy !== "0") { response.status(400).json({ error: "Creator buy is not supported for this launch venue" }); return; }
  const config = getChainConfig(chainFor(input.chain))!;
  try {
    if (await consumeDatabaseRateLimit("launch-quote", clientRateSubject(request), 12, 60)) {
      response.setHeader("Retry-After", "60").status(429).json({ error: "Too many launch quotes. Wait briefly and try again." }); return;
    }
    const client = getPublicClient(config);
    if (await client.getChainId() !== config.chainId) { response.status(503).json({ error: "Configured RPC chain ID mismatch" }); return; }
    let stored: Record<string, unknown>;
    let feeLines: Array<{ kind: string; amount: string; asset: string }>;
    let requires: string[] = [];
    if (input.venue === "pons") {
      const [canLaunch, count, fee] = await Promise.all([
        client.readContract({ address: ponsFactory, abi: launchAbi, functionName: "canLaunch", args: [getAddress(input.wallet)] }),
        client.readContract({ address: ponsFactory, abi: launchAbi, functionName: "launchConfigCount" }),
        client.readContract({ address: ponsFactory, abi: launchAbi, functionName: "launchFee" })
      ]);
      if (!canLaunch) { response.status(409).json({ error: "Pons is not currently accepting launches from this wallet" }); return; }
      const openConfigs: Array<{ id: bigint; config: unknown }> = [];
      for (let id = 0n; id < count; id++) {
        const launchConfig = await client.readContract({ address: ponsFactory, abi: launchAbi, functionName: "getLaunchConfig", args: [id] });
        if (launchConfig.enabled) openConfigs.push({ id, config: launchConfig });
      }
      if (!openConfigs.length) { response.status(503).json({ error: "Pons has no enabled launch configurations" }); return; }
      const selected = openConfigs[0]!;
      const pairToken = zeroAddress;
      const expectedEconomics = await client.readContract({ address: ponsFactory, abi: launchAbi, functionName: "previewLaunchEconomics", args: [selected.id, pairToken] });
      const salt = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
      const socials = { twitter: input.x ?? "", telegram: input.telegram ?? "", discord: "", website: input.website ?? "", farcaster: "" };
      const params = { name: input.name, symbol: input.symbol.toUpperCase(), logo: input.metadataUri, description: input.description ?? "", socials, creatorFeeRecipient: getAddress(input.wallet), creatorTaxBps: 0, buybackEnabled: true, expectedEconomics, salt };
      const data = encodeFunctionData({ abi: launchAbi, functionName: "launchToken", args: [params, selected.id, pairToken] });
      stored = { to: ponsFactory, value: fee.toString(), data, launchConfigId: selected.id.toString(), economics: expectedEconomics, salt, pairToken, params };
      feeLines = [{ kind: "Pons launch fee", amount: formatEther(fee), asset: "ETH" }];
      requires = [];
    } else {
      const socialMediaUrls = [
        ...(input.x ? [{ platform: "x", url: input.x }] : []),
        ...(input.telegram ? [{ platform: "telegram", url: input.telegram }] : []),
        ...(input.website ? [{ platform: "website", url: input.website }] : [])
      ];
      const sdk = new Clanker();
      const tx = await sdk.getDeployTransaction({
        name: input.name, symbol: input.symbol.toUpperCase(), image: input.metadataUri, chainId: 8453,
        tokenAdmin: getAddress(input.wallet), metadata: { description: input.description ?? "", socialMediaUrls }, context: { interface: "Slipway" }
      });
      const data = encodeFunctionData({ abi: tx.abi, functionName: tx.functionName, args: tx.args });
      stored = { to: tx.address, value: "0", data, args: tx.args };
      feeLines = [{ kind: "Network gas", amount: "Wallet estimated", asset: "ETH" }];
    }
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const quote = { id: randomUUID(), chain: input.chain, chainId: input.chain, wallet: getAddress(input.wallet), venue: input.venue, name: input.name, symbol: input.symbol.toUpperCase(), feeLines, requires, expiresAt };
    await db.query("DELETE FROM launch_quotes WHERE expires_at < now()");
    await db.query("INSERT INTO launch_quotes (id, chain, wallet, venue, quote, expires_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)", [quote.id, config.id, quote.wallet.toLowerCase(), input.venue, JSON.stringify({ ...quote, transaction: stored }), expiresAt]);
    response.setHeader("Cache-Control", "no-store").json(quote);
  } catch {
    response.status(503).json({ error: "Launch quote is temporarily unavailable" });
  }
});

launchRouter.post("/build/launch", async (request, response) => {
  const parsed = z.object({ launchQuoteId: z.string().uuid(), wallet: z.string().refine(isAddress), accountKind: z.literal("eoa") }).strict().safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Invalid unsigned launch build request" }); return; }
  try {
    const wallet = getAddress(parsed.data.wallet);
    const result = await db.query<{ quote: Record<string, any>; expires_at: Date }>("SELECT quote, expires_at FROM launch_quotes WHERE id = $1 AND wallet = $2", [parsed.data.launchQuoteId, wallet.toLowerCase()]);
    const record = result.rows[0];
    if (!record) { response.status(404).json({ error: "Launch quote not found" }); return; }
    if (new Date(record.expires_at).getTime() <= Date.now()) { response.status(410).json({ error: "Launch quote expired; request a fresh quote" }); return; }
    const quote = record.quote;
    const transaction = quote.transaction as { to: string; value: string; data: `0x${string}` };
    response.setHeader("Cache-Control", "no-store").json({
      buildId: randomUUID(), quoteId: parsed.data.launchQuoteId, chain: chainFor(Number(quote.chain)), chainId: Number(quote.chain), wallet, expiresAt: record.expires_at,
      payloads: [{ kind: "evm_transaction", purpose: `launch_${quote.venue}`, chainId: Number(quote.chain), from: wallet, to: getAddress(transaction.to), value: `0x${BigInt(transaction.value).toString(16)}`, data: transaction.data }]
    });
  } catch {
    response.status(503).json({ error: "Unsigned launch build is temporarily unavailable" });
  }
});
