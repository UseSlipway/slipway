import { Router } from "express";

export const marketRouter = Router();

const upstream = "https://api.geckoterminal.com/api/v2";
type MarketFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const defaultMarketFetch: MarketFetch = (...args) => globalThis.fetch(...args);
let marketFetch: MarketFetch = defaultMarketFetch;
let marketFetcherOverridden = false;

// GeckoTerminal's public API allows roughly 30 calls a minute for the whole server, shared by every
// visitor. Spend at most MARKET_UPSTREAM_PER_MINUTE (default 24) per rolling minute, keep a reserve
// for live requests that have no cached copy, and pause upstream calls after a 429.
const upstreamPerMinute = Math.max(1, Number(process.env.MARKET_UPSTREAM_PER_MINUTE) || 24);
const backgroundReserve = Math.ceil(upstreamPerMinute / 2);
const upstreamCalls: number[] = [];
let upstreamCooldownUntil = 0;
const recentlyRequested = new Map<string, number>();
type Priority = "live" | "background";
function takeUpstreamSlot(priority: Priority, now = Date.now()) {
  if (now < upstreamCooldownUntil) return false;
  while (upstreamCalls.length && now - upstreamCalls[0]! >= 60_000) upstreamCalls.shift();
  const limit = priority === "live" ? upstreamPerMinute : upstreamPerMinute - backgroundReserve;
  if (upstreamCalls.length >= limit) return false;
  upstreamCalls.push(now);
  return true;
}
let enforceBudgetInTests = false;
export function setMarketBudgetEnforcedForTests(value: boolean) { enforceBudgetInTests = value }
export function resetMarketBudget() { upstreamCalls.length = 0; upstreamCooldownUntil = 0; recentlyRequested.clear() }
export function setMarketFetcher(fetcher?: MarketFetch) {
  marketFetcherOverridden = Boolean(fetcher);
  marketFetch = fetcher ?? defaultMarketFetch;
}
const networkPattern = "(?:robinhood|base)";
// v2/v3 pools are 20-byte addresses; Uniswap v4 pools (e.g. graduated Pons tokens) are 32-byte ids, "0x" + 64 hex.
const poolPattern = "[A-Za-z0-9]{32,66}";
const addressList = "0x[a-fA-F0-9]{40}(?:,0x[a-fA-F0-9]{40}){0,29}";
const routes = [
  new RegExp(`^/networks/trending_pools$`),
  new RegExp(`^/networks/${networkPattern}/trending_pools$`),
  /^\/search\/pools$/,
  new RegExp(`^/networks/${networkPattern}/pools/${poolPattern}$`),
  new RegExp(`^/networks/${networkPattern}/pools/${poolPattern}/ohlcv/(minute|hour|day)$`),
  new RegExp(`^/networks/${networkPattern}/pools/${poolPattern}/trades$`),
  new RegExp(`^/networks/${networkPattern}/tokens/multi/${addressList}$`),
];

type CachedResponse = { status: number; contentType: string; body: string; fetchedAt: Date };
type Db = typeof import("../db/index").db;
const refreshes = new Map<string, Promise<CachedResponse | null>>();
let databaseUnavailableUntil = 0;
let lastCacheCleanupAt = 0;

function cacheKey(path: string, params: URLSearchParams) {
  const normalized = new URLSearchParams([...params.entries()].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv)));
  return `${path}${normalized.size ? `?${normalized}` : ""}`;
}

function ttlFor(path: string) {
  if (path === "/search/pools") return 120_000;
  if (path.includes("/ohlcv/")) return 60_000;
  if (path.endsWith("/trades")) return 45_000;
  if (path.includes("/tokens/multi/")) return 120_000;
  if (path.endsWith("/trending_pools")) return 60_000;
  return 60_000;
}

async function database(): Promise<Db | null> {
  if (Date.now() < databaseUnavailableUntil) return null;
  try { return (await import("../db/index")).db; } catch { return null; }
}

async function readCache(key: string): Promise<CachedResponse | null> {
  const db = await database();
  if (!db) return null;
  try {
    const result = await db.query<{ status_code: number; content_type: string; body: string; fetched_at: Date }>(
      "SELECT status_code, content_type, body, fetched_at FROM market_response_cache WHERE cache_key = $1",
      [key],
    );
    const row = result.rows[0];
    return row ? { status: row.status_code, contentType: row.content_type, body: row.body, fetchedAt: row.fetched_at } : null;
  } catch {
    databaseUnavailableUntil = Date.now() + 30_000;
    return null;
  }
}

async function fetchAndCache(key: string, target: URL, priority: Priority = "live"): Promise<CachedResponse | null> {
  const active = refreshes.get(key);
  if (active) return active;
  if ((!marketFetcherOverridden || enforceBudgetInTests) && !takeUpstreamSlot(priority)) return null;
  const job = (async () => {
    try {
      const result = await marketFetch(target, {
        headers: { accept: "application/json;version=20230203" },
        signal: AbortSignal.timeout(10_000),
      });
      if (result.status === 429) {
        const retryAfter = Number(result.headers.get("retry-after"));
        upstreamCooldownUntil = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 300) * 1000 : 60_000);
        return null;
      }
      const body = await result.text();
      if (body.length > 2_000_000) return null;
      const value: CachedResponse = {
        status: result.status,
        contentType: result.headers.get("content-type") ?? "application/json",
        body,
        fetchedAt: new Date(),
      };
      // Only cache successful provider responses. A rate limit or outage must not
      // replace the last good payload.
      if (result.ok && !marketFetcherOverridden) {
        const db = await database();
        await db?.query(
          `INSERT INTO market_response_cache (cache_key, status_code, content_type, body, fetched_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (cache_key) DO UPDATE SET status_code = EXCLUDED.status_code,
             content_type = EXCLUDED.content_type, body = EXCLUDED.body, fetched_at = now()`,
          [key, value.status, value.contentType, value.body],
        ).catch(() => undefined);
      }
      return value;
    } catch { return null; }
  })();
  refreshes.set(key, job);
  try { return await job; } finally { refreshes.delete(key); }
}

function sendCached(response: import("express").Response, cached: CachedResponse, cacheStatus: "HIT" | "STALE" | "MISS") {
  response.status(cached.status);
  response.setHeader("Cache-Control", "public, max-age=15");
  response.setHeader("X-Market-Cache", cacheStatus);
  response.setHeader("X-Market-Updated-At", cached.fetchedAt.toISOString());
  response.setHeader("Content-Type", cached.contentType);
  response.send(cached.body);
}

function validQuery(path: string, params: URLSearchParams): boolean {
  const allowed = path === "/search/pools"
    ? new Set(["query", "network", "include", "page"])
    : path.endsWith("/trending_pools")
      ? new Set(["include", "page", "duration", "sort"])
      : path.includes("/ohlcv/")
        ? new Set(["aggregate", "limit", "currency", "token", "before_timestamp"])
        : path.endsWith("/trades")
          ? new Set(["trade_volume_in_usd_greater_than"])
          : new Set(["include"]);
  if ([...params.keys()].some((key) => !allowed.has(key))) return false;
  const include = params.get("include");
  if (include && include !== (path.includes("/tokens/multi/") ? "top_pools" : "base_token,quote_token")) return false;
  const network = params.get("network");
  if (network && !["robinhood", "base"].includes(network)) return false;
  const query = params.get("query");
  if (path === "/search/pools" && (!query || query.trim().length < 2 || query.length > 100)) return false;
  for (const key of ["page", "aggregate", "limit", "before_timestamp"]) {
    const value = params.get(key);
    if (value && (!/^\d{1,12}$/.test(value) || Number(value) <= 0)) return false;
  }
  const minUsd = params.get("trade_volume_in_usd_greater_than");
  if (minUsd !== null && (!/^\d{1,9}$/.test(minUsd) || Number(minUsd) > 1_000_000)) return false;
  if (params.has("aggregate") && Number(params.get("aggregate")) > 1440) return false;
  if (params.has("limit") && Number(params.get("limit")) > 1000) return false;
  if (params.has("currency") && !["usd", "token"].includes(params.get("currency")!)) return false;
  if (params.has("token") && !["base", "quote"].includes(params.get("token")!)) return false;
  if (params.has("duration") && !["1h", "6h", "24h"].includes(params.get("duration")!)) return false;
  if (params.has("sort") && !["h24_trending", "h24_volume_usd_desc", "h24_tx_count_desc"].includes(params.get("sort")!)) return false;
  return true;
}

marketRouter.get("/*path", async (request, response) => {
  const path = request.path;
  const params = new URL(request.originalUrl, "http://localhost").searchParams;
  if (!routes.some((route) => route.test(path)) || !validQuery(path, params)) {
    response.status(400).json({ error: "Unsupported market data request" });
    return;
  }

  const key = cacheKey(path, params);
  recentlyRequested.set(key, Date.now());
  const cached = marketFetcherOverridden ? null : await readCache(key);
  const fresh = cached && Date.now() - cached.fetchedAt.getTime() < ttlFor(path);
  const target = new URL(`${upstream}${path}`);
  target.search = params.toString();
  if (cached && fresh) {
    sendCached(response, cached, "HIT");
    return;
  }
  if (cached) {
    // Serve the last good response immediately. A shared background refresh
    // updates Postgres for the next request without making the UI wait.
    sendCached(response, cached, "STALE");
    void fetchAndCache(key, target, "background");
    return;
  }

  const result = await fetchAndCache(key, target);
  if (result) {
    sendCached(response, result, "MISS");
    return;
  }
  response.setHeader("Retry-After", "30");
  response.status(503).json({ error: "Market data is busy. Retrying shortly." });
});

export function startMarketCacheRefresh(intervalMs = 30_000) {
  const timer = setInterval(async () => {
    const db = await database();
    if (!db) return;
    try {
      const rows = await db.query<{ cache_key: string }>(
        `SELECT cache_key FROM market_response_cache
         WHERE (cache_key LIKE '%/trending_pools%' AND fetched_at < now() - interval '50 seconds')
            OR (cache_key LIKE '%/ohlcv/%' AND fetched_at < now() - interval '50 seconds')
            OR (cache_key NOT LIKE '%/trending_pools%' AND cache_key NOT LIKE '%/ohlcv/%'
                AND cache_key NOT LIKE '/search/%' AND fetched_at < now() - interval '25 seconds')
         ORDER BY fetched_at ASC LIMIT 5`,
      );
      for (const [key, at] of recentlyRequested) if (Date.now() - at > 10 * 60_000) recentlyRequested.delete(key);
      for (const row of rows.rows) {
        // Only keep entries fresh that someone viewed in the last two minutes.
        if (Date.now() - (recentlyRequested.get(row.cache_key) ?? 0) > 2 * 60_000) continue;
        const [path, query = ""] = row.cache_key.split("?");
        const params = new URLSearchParams(query);
        const target = new URL(`${upstream}${path}`);
        target.search = params.toString();
        await fetchAndCache(row.cache_key, target, "background");
      }
      if (Date.now() - lastCacheCleanupAt > 60 * 60_000) {
        await db.query("DELETE FROM market_response_cache WHERE fetched_at < now() - interval '7 days'");
        lastCacheCleanupAt = Date.now();
      }
    } catch (error) {
      databaseUnavailableUntil = Date.now() + 30_000;
      console.warn(JSON.stringify({ event: "market_cache_refresh_error", errorType: error instanceof Error ? error.name : "unknown" }));
    }
  }, intervalMs);
  timer.unref();
  return timer;
}
