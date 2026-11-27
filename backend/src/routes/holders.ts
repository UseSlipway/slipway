import { Router } from "express";
import { getAddress, isAddress, parseAbi, type Address } from "viem";
import { getChainConfig, getPublicClient } from "../chains/config";
import { db } from "../db/index";

export const holderRouter = Router();

const zeroAddress = "0x0000000000000000000000000000000000000000";
const erc20Abi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
]);
const ponsFactory = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" as Address;
const ponsFactoryAbi = parseAbi([
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "function getLaunchedToken(address token) view returns (LaunchedToken)"
]);
const orbitFactoryAbi = parseAbi([
  "function launches(address token) view returns (address creator, address pool, uint64 createdAt, string metadata)"
]);

type HolderSnapshot = {
  chain: string;
  token: string;
  holderCount: number | null;
  top10SharePercent: number | null;
  creator: string | null;
  creatorSharePercent: number | null;
  provider: string | null;
  providerUpdatedAt: string | null;
  fetchedAt: string;
  stale?: boolean;
};

type ProviderStats = Awaited<ReturnType<typeof providerHolderStats>>;
const providerRefreshes = new Map<string, Promise<ProviderStats>>();

function sharedProviderStats(chain: string, token: string): Promise<ProviderStats> {
  const key = `${chain}:${token.toLowerCase()}`;
  const active = providerRefreshes.get(key);
  if (active) return active;
  const job = providerHolderStats(chain, token);
  providerRefreshes.set(key, job);
  void job.then(() => providerRefreshes.delete(key), () => providerRefreshes.delete(key));
  return job;
}

function parsePercent(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function parseCount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function providerHolderStats(chain: string, token: string) {
  // Current CoinGecko Onchain holder coverage includes Base, but not Robinhood
  // Chain or SPCX Chain. Keep those metrics explicitly unavailable there.
  if (chain !== "base") return { holderCount: null, top10SharePercent: null, provider: null, providerUpdatedAt: null };

  const key = process.env.COINGECKO_API_KEY?.trim();
  const plan = process.env.COINGECKO_API_PLAN?.trim().toLowerCase();
  const pro = Boolean(key && plan === "pro");
  const base = key
    ? pro ? "https://pro-api.coingecko.com/api/v3/onchain" : "https://api.coingecko.com/api/v3/onchain"
    : "https://api.geckoterminal.com/api/v2";
  const headers: Record<string, string> = key
    ? { accept: "application/json", [pro ? "x-cg-pro-api-key" : "x-cg-demo-api-key"]: key }
    : { accept: "application/json;version=20230203" };
  try {
    const response = await fetch(`${base}/networks/base/tokens/${token}/info`, {
      headers,
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return { holderCount: null, top10SharePercent: null, provider: null, providerUpdatedAt: null };
    const json = await response.json() as { data?: { attributes?: { holders?: { count?: unknown; distribution_percentage?: { top_10?: unknown }; last_updated?: unknown } } } };
    const holders = json.data?.attributes?.holders;
    return {
      holderCount: parseCount(holders?.count),
      top10SharePercent: parsePercent(holders?.distribution_percentage?.top_10),
      provider: "CoinGecko Onchain",
      providerUpdatedAt: typeof holders?.last_updated === "string" ? holders.last_updated : null
    };
  } catch {
    return { holderCount: null, top10SharePercent: null, provider: null, providerUpdatedAt: null };
  }
}

async function indexedCreator(chain: string, token: string): Promise<string | null> {
  try {
    const result = await db.query<{ creator: string | null }>(
      `SELECT lower(coalesce(payload->'args'->>'deployer', payload->'args'->>'tokenAdmin', payload->'args'->>'creator')) AS creator
       FROM chain_events
       WHERE chain = $1 AND event_type = 'token.launched'
         AND lower(coalesce(payload->'args'->>'token', payload->'args'->>'tokenAddress')) = $2
       ORDER BY id ASC LIMIT 1`,
      [chain, token.toLowerCase()]
    );
    const creator = result.rows[0]?.creator;
    return creator && isAddress(creator) && creator.toLowerCase() !== zeroAddress ? getAddress(creator) : null;
  } catch {
    return null;
  }
}

async function launchCreator(chain: string, token: Address): Promise<string | null> {
  const config = getChainConfig(chain);
  if (!config) return null;
  try {
    const client = getPublicClient(config);
    if (chain === "rhc") {
      const launch = await client.readContract({ address: ponsFactory, abi: ponsFactoryAbi, functionName: "getLaunchedToken", args: [token] });
      if (launch.exists && launch.deployer !== zeroAddress) return getAddress(launch.deployer);
    }
    if (chain === "spcx" && config.orbit) {
      const launch = await client.readContract({ address: config.orbit.factory, abi: orbitFactoryAbi, functionName: "launches", args: [token] });
      if (launch[0] !== zeroAddress) return getAddress(launch[0]);
    }
  } catch { /* The indexed launch event below remains the fallback. */ }
  return indexedCreator(chain, token);
}

async function readCached(chain: string, token: string) {
  try {
    const result = await db.query<{ payload: HolderSnapshot; fetched_at: Date }>(
      "SELECT payload, fetched_at FROM holder_breakdown_cache WHERE chain = $1 AND token_address = $2",
      [chain, token.toLowerCase()]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { payload: row.payload, fetchedAt: new Date(row.fetched_at).getTime() };
  } catch {
    return null;
  }
}

holderRouter.get("/:chain/:token", async (request, response) => {
  const chain = request.params.chain;
  const rawToken = request.params.token;
  if (!getChainConfig(chain) || !isAddress(rawToken)) {
    response.status(400).json({ error: "Provide a supported chain and token address" });
    return;
  }

  const token = getAddress(rawToken);
  const cached = await readCached(chain, token);
  if (cached && Date.now() - cached.fetchedAt < 60_000) {
    response.setHeader("Cache-Control", "public, max-age=30").json({ ...cached.payload, stale: false });
    return;
  }

  const config = getChainConfig(chain)!;
  let client: ReturnType<typeof getPublicClient>;
  try {
    client = getPublicClient(config);
  } catch {
    if (cached) {
      response.setHeader("Cache-Control", "no-store").json({ ...cached.payload, stale: true });
      return;
    }
    response.status(503).json({ error: "Holder data is temporarily unavailable for this network" });
    return;
  }
  const [provider, creator] = await Promise.all([
    sharedProviderStats(chain, token),
    launchCreator(chain, token)
  ]);
  const providerUnavailable = provider.holderCount === null && provider.top10SharePercent === null && cached?.payload.provider;
  let creatorSharePercent: number | null = null;
  if (creator) {
    try {
      const [supply, balance] = await Promise.all([
        client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
        client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [creator as Address] })
      ]);
      if (supply > 0n) creatorSharePercent = Number((balance * 1_000_000n) / supply) / 10_000;
    } catch { /* An unavailable or nonstandard token must not be shown as 0%. */ }
  }

  const fetchedAt = new Date().toISOString();
  const snapshot: HolderSnapshot = {
    chain,
    token,
    holderCount: providerUnavailable ? cached!.payload.holderCount : provider.holderCount,
    top10SharePercent: providerUnavailable ? cached!.payload.top10SharePercent : provider.top10SharePercent,
    creator,
    creatorSharePercent,
    provider: provider.provider ?? (providerUnavailable ? cached!.payload.provider : null),
    providerUpdatedAt: provider.providerUpdatedAt ?? (providerUnavailable ? cached!.payload.providerUpdatedAt : null),
    fetchedAt
  };
  if (cached && !provider.provider && snapshot.creatorSharePercent === null) {
    response.setHeader("Cache-Control", "no-store").json({ ...cached.payload, stale: true });
    return;
  }
  await db.query(
    `INSERT INTO holder_breakdown_cache (chain, token_address, payload, fetched_at) VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (chain, token_address) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
    [chain, token.toLowerCase(), JSON.stringify(snapshot)]
  ).catch(() => undefined);
  response.setHeader("Cache-Control", "public, max-age=30").json({ ...snapshot, stale: Boolean(providerUnavailable) });
});
