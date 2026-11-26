import { Router } from "express";

// "Trending on Slipway": tokens ranked by the quotes and unsigned trade builds Slipway served
// recently. Counters are anonymous (chain, token, 10-minute bucket); watcher counts are aggregated
// inside the database, so no wallet address is ever returned.
export const trendingRouter = Router();

type ActivityKind = "quote" | "build";
const windows = { "1h": "1 hour", "24h": "24 hours" } as const;
const minimumActivity = 3;
const cache = new Map<string, { at: number; body: unknown }>();
let lastCleanup = 0;

export function trendingScore(quotes: number, builds: number, watchers: number) {
  // A prepared trade is a much stronger signal than a quote (the UI quotes as people type).
  return quotes + builds * 4 + watchers * 2;
}

export async function recordTokenActivity(chain: string, token: string, kind: ActivityKind) {
  if ((chain !== "rhc" && chain !== "base") || !/^0x[a-fA-F0-9]{40}$/.test(token)) return;
  try {
    const { db } = await import("../db/index");
    const column = kind === "build" ? "builds" : "quotes";
    await db.query(
      `INSERT INTO token_activity (chain, token_address, bucket, ${column})
       VALUES ($1, $2, to_timestamp(floor(extract(epoch FROM now()) / 600) * 600), 1)
       ON CONFLICT (chain, token_address, bucket) DO UPDATE SET ${column} = token_activity.${column} + 1`,
      [chain, token.toLowerCase()],
    );
    if (Date.now() - lastCleanup > 60 * 60_000) {
      lastCleanup = Date.now();
      await db.query("DELETE FROM token_activity WHERE bucket < now() - interval '8 days'");
    }
  } catch {
    // Trending is best-effort; never fail a quote or build because of it.
  }
}

trendingRouter.get("/", async (request, response) => {
  const window = request.query.window ?? "1h";
  const chain = request.query.chain;
  const limitRaw = request.query.limit ?? "20";
  if (typeof window !== "string" || !(window in windows)
    || (chain !== undefined && chain !== "rhc" && chain !== "base")
    || typeof limitRaw !== "string" || !/^\d{1,2}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > 30) {
    response.status(400).json({ error: "Invalid trending query" });
    return;
  }
  const key = `${window}|${chain ?? "all"}|${limitRaw}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) {
    response.setHeader("Cache-Control", "public, max-age=30").json(hit.body);
    return;
  }
  try {
    const { db } = await import("../db/index");
    const values: unknown[] = [windows[window as keyof typeof windows], minimumActivity];
    let where = "bucket >= now() - $1::interval";
    if (chain) { values.push(chain); where += ` AND chain = $${values.length}`; }
    values.push(Number(limitRaw) * 2);
    const activity = await db.query<{ chain: string; token: string; quotes: string; builds: string }>(
      `SELECT chain, token_address AS token, sum(quotes) AS quotes, sum(builds) AS builds
       FROM token_activity WHERE ${where}
       GROUP BY chain, token_address
       HAVING sum(quotes) + sum(builds) >= $2
       ORDER BY sum(builds) * 4 + sum(quotes) DESC
       LIMIT $${values.length}`,
      values,
    );
    const tokens = activity.rows.map((row) => row.token);
    const watchers = new Map<string, number>();
    if (tokens.length) {
      const watched = await db.query<{ token: string; watchers: string }>(
        `SELECT lower(w->>'address') AS token, count(DISTINCT wallet_address) AS watchers
         FROM wallet_workspaces, jsonb_array_elements(watches) AS w
         WHERE lower(w->>'address') = ANY($1::text[])
         GROUP BY 1`,
        [tokens],
      );
      for (const row of watched.rows) watchers.set(row.token, Number(row.watchers));
    }
    const ranked = activity.rows.map((row) => {
      const quotes = Number(row.quotes), builds = Number(row.builds), watching = watchers.get(row.token) ?? 0;
      return { chain: row.chain, token: row.token, quotes, builds, watchers: watching, score: trendingScore(quotes, builds, watching) };
    }).sort((a, b) => b.score - a.score).slice(0, Number(limitRaw));
    const body = { window, generatedAt: new Date().toISOString(), tokens: ranked };
    cache.set(key, { at: Date.now(), body });
    response.setHeader("Cache-Control", "public, max-age=30").json(body);
  } catch {
    response.status(503).json({ error: "Trending is temporarily unavailable" });
  }
});
