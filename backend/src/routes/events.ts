import { Router } from "express";
import { db } from "../db/index";

export const eventRouter = Router();
const eventTypes = new Set(["token.launched", "pool.graduated", "pool.initialized"]);

eventRouter.get("/", async (request, response) => {
  const afterRaw = request.query.after ?? "0";
  const limitRaw = request.query.limit ?? "100";
  const chain = request.query.chain;
  const typesRaw = request.query.types;
  if (typeof afterRaw !== "string" || !/^\d{1,18}$/.test(afterRaw)
    || typeof limitRaw !== "string" || !/^\d{1,3}$/.test(limitRaw)
    || Number(limitRaw) < 1 || Number(limitRaw) > 500
    || (chain !== undefined && chain !== "base" && chain !== "rhc")
    || (typesRaw !== undefined && typeof typesRaw !== "string")) {
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
      block_hash AS "blockHash", transaction_hash AS "transactionHash", log_index AS "logIndex", created_at AS "indexedAt"
      FROM chain_events WHERE id > $1`;
    if (chain) { values.push(chain); sql += ` AND chain = $${values.length}`; }
    if (types.length) { values.push(types); sql += ` AND event_type = ANY($${values.length}::text[])`; }
    values.push(Number(limitRaw));
    sql += ` ORDER BY id ASC LIMIT $${values.length}`;
    const result = await db.query(sql, values);
    response.setHeader("Cache-Control", "no-store").json({ events: result.rows, nextCursor: result.rows.at(-1)?.id ?? Number(afterRaw) });
  } catch {
    response.status(503).json({ error: "Event feed is temporarily unavailable" });
  }
});
