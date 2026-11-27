import { Router } from "express";
import { isAddress } from "viem";
import { db } from "../db/index";
import { cachedMarketPayload } from "./market";

export const duplicateRouter = Router();

type Match = {
  chain: string;
  token: string;
  name: string;
  symbol: string;
  launchedAt: string | null;
  pool: string | null;
  marketCap: number | null;
  poolCreatedAt: string | null;
  source: "indexed launch" | "market pool";
};

const safeText = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

function numberOrNull(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function indexedToken(args: Record<string, unknown>, chain: string, at: unknown): Match | null {
  const token = safeText(args.tokenAddress ?? args.token, 64);
  if (!isAddress(token)) return null;
  const symbol = safeText(args.tokenSymbol ?? args.symbol, 32);
  const name = safeText(args.tokenName ?? args.name, 100);
  return {
    chain,
    token: token.toLowerCase(),
    symbol,
    name,
    launchedAt: typeof at === "string" ? at : at instanceof Date ? at.toISOString() : null,
    pool: null,
    marketCap: null,
    poolCreatedAt: null,
    source: "indexed launch"
  };
}

async function indexedMatches(symbol: string, name: string): Promise<{ matches: Match[]; available: boolean }> {
  try {
    const result = await db.query<{ chain: string; payload: Record<string, unknown>; at: Date }>(
      `SELECT chain, payload, coalesce(occurred_at, created_at) AS at
       FROM chain_events
       WHERE event_type = 'token.launched'
         AND (($1 <> '' AND lower(coalesce(payload->'args'->>'tokenSymbol', payload->'args'->>'symbol', '')) = $1)
           OR ($2 <> '' AND lower(coalesce(payload->'args'->>'tokenName', payload->'args'->>'name', '')) = $2))
       ORDER BY block_number DESC LIMIT 300`,
      [symbol.toLowerCase(), name.toLowerCase()]
    );
    const matches = result.rows.flatMap((row) => {
      const args = row.payload?.args;
      if (!args || typeof args !== "object" || Array.isArray(args)) return [];
      const match = indexedToken(args as Record<string, unknown>, row.chain, row.at);
      if (!match || !(match.symbol.toLowerCase() === symbol.toLowerCase() || match.name.toLowerCase() === name.toLowerCase())) return [];
      return [match];
    });
    return { matches, available: true };
  } catch {
    return { matches: [], available: false };
  }
}

async function marketMatches(search: string, currentToken: string, symbol: string, name: string): Promise<{ matches: Match[]; networksAvailable: number }> {
  if (search.length < 2) return { matches: [], networksAvailable: 0 };
  const out: Match[] = [];
  let networksAvailable = 0;
  for (const network of ["robinhood", "base"] as const) {
    const params = new URLSearchParams({ query: search, network, include: "base_token,quote_token" });
    const json = await cachedMarketPayload("/search/pools", params);
    if (!json || !Array.isArray(json.data)) continue;
    networksAvailable += 1;
    const tokens = new Map<string, Record<string, unknown>>();
    for (const entry of Array.isArray(json.included) ? json.included : []) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (row.type === "token" && typeof row.id === "string" && row.attributes && typeof row.attributes === "object") {
        tokens.set(row.id, row.attributes as Record<string, unknown>);
      }
    }
    for (const entry of json.data) {
      if (!entry || typeof entry !== "object") continue;
      const pool = entry as Record<string, unknown>;
      const attributes = pool.attributes && typeof pool.attributes === "object" ? pool.attributes as Record<string, unknown> : {};
      const relationships = pool.relationships && typeof pool.relationships === "object" ? pool.relationships as Record<string, unknown> : {};
      const base = relationships.base_token && typeof relationships.base_token === "object" ? (relationships.base_token as Record<string, unknown>).data as Record<string, unknown> | undefined : undefined;
      const quote = relationships.quote_token && typeof relationships.quote_token === "object" ? (relationships.quote_token as Record<string, unknown>).data as Record<string, unknown> | undefined : undefined;
      const tokenRef = base?.id && tokens.has(String(base.id)) ? base : quote?.id && tokens.has(String(quote.id)) ? quote : null;
      if (!tokenRef) continue;
      const info = tokens.get(String(tokenRef.id))!;
      const token = safeText(info.address ?? String(tokenRef.id).split("_").at(-1), 64);
      const candidateSymbol = safeText(info.symbol, 32);
      const candidateName = safeText(info.name, 100);
      if (!isAddress(token) || token.toLowerCase() === currentToken.toLowerCase()) continue;
      if (!(candidateSymbol.toLowerCase() === symbol.toLowerCase() || candidateName.toLowerCase() === name.toLowerCase())) continue;
      const created = typeof attributes.pool_created_at === "string" ? attributes.pool_created_at : null;
      const match: Match = {
        chain: network === "robinhood" ? "rhc" : "base",
        token: token.toLowerCase(),
        name: candidateName,
        symbol: candidateSymbol,
        launchedAt: null,
        pool: safeText(attributes.address, 80) || null,
        marketCap: numberOrNull(attributes.market_cap_usd),
        poolCreatedAt: created,
        source: "market pool"
      };
      out.push(match);
    }
  }
  return { matches: out, networksAvailable };
}

duplicateRouter.get("/", async (request, response) => {
  const chain = request.query.chain;
  const token = request.query.token;
  const symbol = safeText(request.query.symbol, 32);
  const name = safeText(request.query.name, 100);
  const marketCap = numberOrNull(request.query.marketCap);
  const poolCreatedAt = safeText(request.query.poolCreatedAt, 40);
  if ((chain !== "rhc" && chain !== "base" && chain !== "spcx") || typeof token !== "string" || !isAddress(token)
    || !symbol || !name || (request.query.marketCap !== undefined && marketCap === null)
    || (poolCreatedAt && !Number.isFinite(Date.parse(poolCreatedAt)))) {
    response.status(400).json({ error: "Provide a supported chain, token address, name and ticker" });
    return;
  }

  const [launches, bySymbol, byName] = await Promise.all([
    indexedMatches(symbol, name),
    marketMatches(symbol, token, symbol, name),
    name.toLowerCase() === symbol.toLowerCase() ? Promise.resolve({ matches: [], networksAvailable: 0 }) : marketMatches(name, token, symbol, name)
  ]);
  const matches = new Map<string, Match>();
  for (const candidate of [...launches.matches, ...bySymbol.matches, ...byName.matches]) {
    const key = `${candidate.chain}:${candidate.token}`;
    const previous = matches.get(key);
    if (!previous || (candidate.marketCap ?? -1) > (previous.marketCap ?? -1)) matches.set(key, candidate);
  }
  const duplicates = [...matches.values()].filter((candidate) => candidate.chain !== chain || candidate.token !== token.toLowerCase());
  const currentCreated = Date.parse(poolCreatedAt);
  const earlierLargerPool = Number.isFinite(currentCreated) && marketCap !== null
    ? duplicates.filter((candidate) => candidate.marketCap !== null && candidate.marketCap > marketCap
      && candidate.poolCreatedAt && Date.parse(candidate.poolCreatedAt) < currentCreated)
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))[0] ?? null
    : null;
  const indexedCount = launches.matches.filter((candidate) => candidate.chain !== chain || candidate.token !== token.toLowerCase()).length;
  response.setHeader("Cache-Control", "public, max-age=30").json({
    chain,
    token: token.toLowerCase(),
    symbol,
    name,
    matches: duplicates.length,
    indexedLaunchMatches: indexedCount,
    marketDataMatches: duplicates.filter((candidate) => candidate.source === "market pool").length,
    sourceAvailability: {
      indexedLaunches: launches.available ? "available" : "unavailable",
      indexedLaunchMetadata: "partial",
      marketSearches: bySymbol.networksAvailable + byName.networksAvailable,
      marketSearchesExpected: name.toLowerCase() === symbol.toLowerCase() ? 2 : 4
    },
    earlierLargerPool,
    samples: duplicates.slice(0, 5),
    checkedAt: new Date().toISOString()
  });
});
