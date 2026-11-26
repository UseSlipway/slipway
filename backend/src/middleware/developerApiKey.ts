import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { db } from "../db/index";
import { consumeDatabaseRateLimit } from "./rateLimit";

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export async function requireDeveloperApiKey(request: Request, response: Response, next: NextFunction) {
  const bearer = /^Bearer (slw_live_[A-Za-z0-9_-]{43})$/.exec(request.header("authorization") ?? "");
  const supplied = bearer?.[1] ?? request.header("x-api-key") ?? "";
  if (!/^slw_live_[A-Za-z0-9_-]{43}$/.test(supplied)) {
    response.status(401).json({ error: "A valid Slipway API key is required" });
    return;
  }

  try {
    const result = await db.query<{ id: string; wallet_address: string }>(
      `UPDATE developer_api_keys SET last_used_at = now()
       WHERE key_hash = $1 AND revoked_at IS NULL
       RETURNING id, wallet_address`,
      [hashKey(supplied)]
    );
    const key = result.rows[0];
    if (!key) {
      response.status(401).json({ error: "API key is invalid or revoked" });
      return;
    }
    if (await consumeDatabaseRateLimit("developer-api", key.id, 120, 60)) {
      response.setHeader("Retry-After", "60").status(429).json({ error: "API rate limit reached. Try again shortly." });
      return;
    }
    response.locals.developerApiKeyId = key.id;
    response.locals.developerApiWallet = key.wallet_address;
    next();
  } catch {
    response.status(503).json({ error: "API key authentication is temporarily unavailable" });
  }
}
