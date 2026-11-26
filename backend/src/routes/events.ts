import { Router } from "express";
import { db } from "../db/index";
import { backfillStatus } from "../events/indexer";

export const eventRouter = Router();
const eventTypes = new Set(["token.launched", "pool.graduated", "pool.initialized"]);

eventRouter.get("/", async (request, response) => {
  const afterRaw = request.query.after ?? "0";
  const limitRaw = request.query.limit ?? "100";
  const chain = request.query.chain;
  const typesRaw = request.query.types;
  const wallet = request.query.wallet;
  const order = request.query.order;
  if (typeof afterRaw !== "string" || !/^\d{1,18}$/.test(afterRaw)
    || typeof limitRaw !== "string" || !/^\d{1,3}$/.test(limitRaw)
    || Number(limitRaw) < 1 || Number(limitRaw) > 500
    || (chain !== undefined && chain !== "base" && chain !== "rhc")
    || (wallet !== undefined && (typeof wallet !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(wallet)))
    || (typesRaw !== undefined && typeof typesRaw !== "string")
    || (order !== undefined && order !== "asc" && order !== "desc")) {
    response.status(400).json({ error: "Invalid event query" });
    return;
  }
  const types = typesRaw ? typesRaw.split(",") : [];
  if (types.length > 3 || types.some((type) => !eventTypes.has(type))) {
    response.status(400).json({ error: "Unsupported event type" });
    return;
  }
  try {
    const values: unknown[] = [afterRaw];
    let sql = `SELECT id, chain, event_type AS "type", payload, block_number AS "blockNumber",
      block_hash AS "blockHash", transaction_hash AS "transactionHash", log_index AS "logIndex", coalesce(occurred_at, created_at) AS "indexedAt", occurred_at AS "occurredAt"
      FROM chain_events WHERE id > $1`;
    if (chain) { values.push(chain); sql += ` AND chain = $${values.length}`; }
    if (types.length) { values.push(types); sql += ` AND event_type = ANY($${values.length}::text[])`; }
    if (wallet) {
      values.push(wallet.toLowerCase());
      const walletParam = `$${values.length}`;
      sql += ` AND (lower(payload->'args'->>'deployer') = ${walletParam}
        OR lower(payload->'args'->>'tokenAdmin') = ${walletParam}
        OR lower(payload->'args'->>'msgSender') = ${walletParam})`;
    }
    values.push(Number(limitRaw));
    // Wallet views default to newest first; `order` lets other feeds (such as recent graduations) ask for it too.
    const descending = order ? order === "desc" : Boolean(wallet);
    // Newest-first views sort by block, so backfilled history never jumps ahead of recent events.
    sql += descending ? ` ORDER BY block_number DESC, log_index DESC LIMIT $${values.length}` : ` ORDER BY id ASC LIMIT $${values.length}`;
    const result = await db.query(sql, values);
    response.setHeader("Cache-Control", "no-store").json({ events: result.rows, nextCursor: result.rows.at(-1)?.id ?? Number(afterRaw) });
  } catch {
    response.status(503).json({ error: "Event feed is temporarily unavailable" });
  }
});

// Creator reputation for a token: who launched it (from the indexed launch event) and how their
// other indexed launches went. Only public onchain data; counts start when Slipway began indexing.
const tokenExpr = "lower(coalesce(payload->'args'->>'token', payload->'args'->>'tokenAddress'))";
const creatorExpr = "lower(coalesce(payload->'args'->>'deployer', payload->'args'->>'tokenAdmin'))";
eventRouter.get("/creator", async (request, response) => {
  const chain = request.query.chain;
  const token = request.query.token;
  if ((chain !== "rhc" && chain !== "base") || typeof token !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(token)) {
    response.status(400).json({ error: "Provide a supported chain and token address" });
    return;
  }
  try {
    const since = await db.query<{ since: Date | null }>("SELECT min(coalesce(occurred_at, created_at)) AS since FROM chain_events WHERE chain = $1 AND event_type = 'token.launched'", [chain]);
    const indexedSince = since.rows[0]?.since ?? null;
    const history = await backfillStatus(chain).catch(() => ({ supported: false, complete: false }));
    const launch = await db.query<{ creator: string | null; at: Date }>(
      `SELECT ${creatorExpr} AS creator, coalesce(occurred_at, created_at) AS at FROM chain_events
       WHERE chain = $1 AND event_type = 'token.launched' AND ${tokenExpr} = $2 ORDER BY id ASC LIMIT 1`,
      [chain, token.toLowerCase()],
    );
    const creator = launch.rows[0]?.creator;
    if (!creator || !/^0x[a-f0-9]{40}$/.test(creator)) {
      response.setHeader("Cache-Control", "public, max-age=60").json({ found: false, chain, token: token.toLowerCase(), indexedSince, history });
      return;
    }
    const launches = await db.query<{ token: string; at: Date; graduated: boolean }>(
      `SELECT l.token, l.at, EXISTS (
         SELECT 1 FROM chain_events g WHERE g.chain = $1 AND g.event_type = 'pool.graduated'
           AND lower(coalesce(g.payload->'args'->>'token', g.payload->'args'->>'tokenAddress')) = l.token
       ) AS graduated
       FROM (
         SELECT ${tokenExpr} AS token, coalesce(occurred_at, created_at) AS at FROM chain_events
         WHERE chain = $1 AND event_type = 'token.launched' AND ${creatorExpr} = $2
         ORDER BY block_number DESC LIMIT 500
       ) l`,
      [chain, creator],
    );
    const rows = launches.rows.filter((row) => /^0x[a-f0-9]{40}$/.test(row.token));
    const times = rows.map((row) => new Date(row.at).getTime());
    response.setHeader("Cache-Control", "public, max-age=60").json({
      found: true,
      chain,
      token: token.toLowerCase(),
      creator,
      launchedAt: launch.rows[0]!.at,
      launches: rows.length,
      graduated: rows.filter((row) => row.graduated).length,
      firstLaunchAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
      lastLaunchAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
      recent: rows.slice(0, 8).map((row) => ({ token: row.token, at: row.at, graduated: row.graduated })),
      capped: launches.rows.length >= 500,
      indexedSince,
      history,
    });
  } catch {
    response.status(503).json({ error: "Creator history is temporarily unavailable" });
  }
});
