import { Router } from "express";
import { randomUUID } from "node:crypto";
import { encodeFunctionData, formatUnits, getAddress, isAddress, parseAbi, type Address } from "viem";
import { z } from "zod";
import { db } from "../db/index";
import { getChainConfig, getPublicClient } from "../chains/config";

// Creator earnings: what launch-fee balances a wallet can claim, read straight from each launchpad's
// own fee contract, and unsigned claim transactions to those contracts. Nothing passes through Slipway.
//
// Pons V2 (Robinhood Chain): fee escrow keyed by recipient wallet, across all of its launches.
//   balanceOf(recipient) -> ETH, balanceOfToken(recipient, token) -> ERC-20; claim() / claimToken(token).
//   Source: docs.ponsfamily.com developers/fees-and-claims + developers/contracts.
// Clanker v4 (Base): fee locker keyed by fee owner and claimed token.
//   availableFees(feeOwner, token); claim(feeOwner, token).
//   Source: clanker v4 docs (ClankerFeeLocker) and clanker-devco/v4-contracts IClankerFeeLocker.
export const earningsRouter = Router();

const ponsEscrow = getAddress("0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e");
const clankerFeeLocker = getAddress("0xF3622742b1E446D92e45E22923Ef11C2fcD55D68");
const ponsEscrowAbi = parseAbi([
  "function balanceOf(address recipient) view returns (uint256)",
  "function balanceOfToken(address recipient, address token) view returns (uint256)",
  "function claim()",
  "function claimToken(address token)",
]);
const clankerLockerAbi = parseAbi([
  "function availableFees(address feeOwner, address token) view returns (uint256)",
  "function claim(address feeOwner, address token)",
]);
const erc20Abi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
const NATIVE = "native";
const tokenExpr = "lower(coalesce(payload->'args'->>'token', payload->'args'->>'tokenAddress'))";
const creatorExpr = "lower(coalesce(payload->'args'->>'deployer', payload->'args'->>'tokenAdmin'))";
const cache = new Map<string, { at: number; body: unknown }>();

type Balance = { chain: "rhc" | "base"; venue: "pons" | "clanker"; asset: string; symbol: string; decimals: number; amount: string; formatted: string };

async function candidateTokens(chain: "rhc" | "base", wallet: string) {
  // Assets this wallet could hold fees in: its launched tokens plus the quote/paired assets they trade against.
  const rows = await db.query<{ token: string | null; pair: string | null }>(
    `SELECT ${tokenExpr} AS token, lower(coalesce(payload->'args'->>'pairToken', payload->'args'->>'pairedToken')) AS pair
     FROM chain_events WHERE chain = $1 AND event_type = 'token.launched' AND ${creatorExpr} = $2
     ORDER BY block_number DESC LIMIT 40`,
    [chain, wallet],
  );
  const set = new Set<string>();
  const wrapped = getChainConfig(chain)!.wrappedNative.toLowerCase();
  if (chain === "base") set.add(wrapped);
  for (const row of rows.rows) {
    if (row.pair && isAddress(row.pair) && !(chain === "rhc" && row.pair === wrapped)) set.add(row.pair);
    if (row.token && isAddress(row.token)) set.add(row.token);
  }
  return { tokens: [...set].slice(0, 40).map((t) => getAddress(t)), launches: rows.rows.length };
}

async function describe(chain: "rhc" | "base", token: Address) {
  const client = getPublicClient(getChainConfig(chain)!);
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }).catch(() => "TOKEN"),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
  ]);
  return { symbol: String(symbol).slice(0, 16), decimals: Number(decimals) };
}

async function ponsBalances(wallet: Address): Promise<Balance[]> {
  const client = getPublicClient(getChainConfig("rhc")!);
  const { tokens } = await candidateTokens("rhc", wallet.toLowerCase());
  const out: Balance[] = [];
  const eth = await client.readContract({ address: ponsEscrow, abi: ponsEscrowAbi, functionName: "balanceOf", args: [wallet] });
  if (eth > 0n) out.push({ chain: "rhc", venue: "pons", asset: NATIVE, symbol: "ETH", decimals: 18, amount: eth.toString(), formatted: formatUnits(eth, 18) });
  const amounts = await Promise.all(tokens.map((token) =>
    client.readContract({ address: ponsEscrow, abi: ponsEscrowAbi, functionName: "balanceOfToken", args: [wallet, token] }).catch(() => 0n)));
  for (const [i, amount] of amounts.entries()) {
    if (amount <= 0n) continue;
    const meta = await describe("rhc", tokens[i]!);
    out.push({ chain: "rhc", venue: "pons", asset: tokens[i]!.toLowerCase(), ...meta, amount: amount.toString(), formatted: formatUnits(amount, meta.decimals) });
  }
  return out;
}

async function clankerBalances(wallet: Address): Promise<Balance[]> {
  const client = getPublicClient(getChainConfig("base")!);
  const { tokens } = await candidateTokens("base", wallet.toLowerCase());
  const amounts = await Promise.all(tokens.map((token) =>
    client.readContract({ address: clankerFeeLocker, abi: clankerLockerAbi, functionName: "availableFees", args: [wallet, token] }).catch(() => 0n)));
  const out: Balance[] = [];
  for (const [i, amount] of amounts.entries()) {
    if (amount <= 0n) continue;
    const meta = await describe("base", tokens[i]!);
    out.push({ chain: "base", venue: "clanker", asset: tokens[i]!.toLowerCase(), ...meta, amount: amount.toString(), formatted: formatUnits(amount, meta.decimals) });
  }
  return out;
}

earningsRouter.get("/creators/earnings", async (request, response) => {
  const wallet = request.query.wallet;
  if (typeof wallet !== "string" || !isAddress(wallet)) { response.status(400).json({ error: "Provide a wallet address" }); return; }
  const address = getAddress(wallet);
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30_000) { response.setHeader("Cache-Control", "no-store").json(hit.body); return; }
  const results = await Promise.allSettled([ponsBalances(address), clankerBalances(address)]);
  const balances = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  const body = {
    wallet: key,
    balances,
    unavailable: results.map((r, i) => r.status === "rejected" ? ["pons", "clanker"][i] : null).filter(Boolean),
    checkedAt: new Date().toISOString(),
    notes: {
      pons: "Pons credits creator fees to its escrow when fees are swept. Fees not yet swept are not included.",
      clanker: "Clanker fees appear once collected into the fee locker.",
    },
  };
  cache.set(key, { at: Date.now(), body });
  response.setHeader("Cache-Control", "no-store").json(body);
});

const claimSchema = z.object({
  chain: z.enum(["rhc", "base"]),
  wallet: z.string().refine(isAddress),
  asset: z.string().refine((value) => value === NATIVE || isAddress(value)),
}).strict();

earningsRouter.post("/build/claim", async (request, response) => {
  const parsed = claimSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Provide a chain, wallet and asset to claim" }); return; }
  const { chain, asset } = parsed.data;
  const wallet = getAddress(parsed.data.wallet);
  const config = getChainConfig(chain)!;
  try {
    const client = getPublicClient(config);
    let to: Address, data: `0x${string}`, available: bigint;
    if (chain === "rhc") {
      to = ponsEscrow;
      if (asset === NATIVE) {
        available = await client.readContract({ address: ponsEscrow, abi: ponsEscrowAbi, functionName: "balanceOf", args: [wallet] });
        data = encodeFunctionData({ abi: ponsEscrowAbi, functionName: "claim" });
      } else {
        available = await client.readContract({ address: ponsEscrow, abi: ponsEscrowAbi, functionName: "balanceOfToken", args: [wallet, getAddress(asset)] });
        data = encodeFunctionData({ abi: ponsEscrowAbi, functionName: "claimToken", args: [getAddress(asset)] });
      }
    } else {
      if (asset === NATIVE) { response.status(400).json({ error: "Clanker fees are claimed per token" }); return; }
      to = clankerFeeLocker;
      available = await client.readContract({ address: clankerFeeLocker, abi: clankerLockerAbi, functionName: "availableFees", args: [wallet, getAddress(asset)] });
      data = encodeFunctionData({ abi: clankerLockerAbi, functionName: "claim", args: [wallet, getAddress(asset)] });
    }
    if (available <= 0n) { response.status(409).json({ error: "Nothing to claim for this asset right now" }); return; }
    cache.delete(wallet.toLowerCase());
    response.setHeader("Cache-Control", "no-store").json({
      buildId: randomUUID(), chain: config.id, chainId: config.chainId, wallet,
      amount: available.toString(),
      payloads: [{ kind: "evm_transaction", purpose: "claim_creator_fees", chainId: config.chainId, from: wallet, to, value: "0x0", data }],
    });
  } catch {
    response.status(503).json({ error: "Could not read creator fees right now" });
  }
});
