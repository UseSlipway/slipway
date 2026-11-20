import { Router } from "express";

export const marketRouter = Router();

const upstream = "https://api.geckoterminal.com/api/v2";
type MarketFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
let marketFetch: MarketFetch = (...args) => globalThis.fetch(...args);
export function setMarketFetcher(fetcher?: MarketFetch) {
  marketFetch = fetcher ?? ((...args) => globalThis.fetch(...args));
}
const networkPattern = "(?:robinhood|base)";
const poolPattern = "[A-Za-z0-9]{32,64}";
const routes = [
  new RegExp(`^/networks/trending_pools$`),
  new RegExp(`^/networks/${networkPattern}/trending_pools$`),
  /^\/search\/pools$/,
  new RegExp(`^/networks/${networkPattern}/pools/${poolPattern}$`),
  new RegExp(`^/networks/${networkPattern}/pools/${poolPattern}/ohlcv/(minute|hour|day)$`),
];

function validQuery(path: string, params: URLSearchParams): boolean {
  const allowed = path === "/search/pools"
    ? new Set(["query", "network", "include", "page"])
    : path.endsWith("/trending_pools")
      ? new Set(["include", "page", "duration", "sort"])
      : path.includes("/ohlcv/")
        ? new Set(["aggregate", "limit", "currency", "token", "before_timestamp"])
        : new Set(["include"]);
  if ([...params.keys()].some((key) => !allowed.has(key))) return false;
  const include = params.get("include");
  if (include && include !== "base_token,quote_token") return false;
  const network = params.get("network");
  if (network && !["robinhood", "base"].includes(network)) return false;
  const query = params.get("query");
  if (path === "/search/pools" && (!query || query.trim().length < 2 || query.length > 100)) return false;
  for (const key of ["page", "aggregate", "limit", "before_timestamp"]) {
    const value = params.get(key);
    if (value && (!/^\d{1,12}$/.test(value) || Number(value) <= 0)) return false;
  }
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

  try {
    const target = new URL(`${upstream}${path}`);
    target.search = params.toString();
    const result = await marketFetch(target, {
      headers: { accept: "application/json;version=20230203" },
      signal: AbortSignal.timeout(10_000),
    });
    response.status(result.status);
    response.setHeader("Cache-Control", path.includes("/ohlcv/") ? "public, max-age=30" : "public, max-age=15");
    response.setHeader("Content-Type", result.headers.get("content-type") ?? "application/json");
    const body = await result.arrayBuffer();
    if (body.byteLength > 2_000_000) {
      response.status(502).json({ error: "Market data response exceeded the service limit" });
      return;
    }
    response.send(Buffer.from(body));
  } catch {
    response.status(503).json({ error: "Market data is temporarily unavailable" });
  }
});
