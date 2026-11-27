import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAddress, isAddress, verifyMessage } from "viem";
import { db } from "../db/index";

export const workspaceRouter = Router();
const challengeLifetimeMs = 5 * 60_000;
const sessionLifetimeMs = 7 * 24 * 60 * 60_000;
const maxWorkspaceBytes = 3_800_000;
const supportedChains = new Set(["rhc", "base", "spcx"]);
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function siweConfig() {
  const domain = (process.env.SLIPWAY_AUTH_DOMAIN?.trim() || "tryslipway.com").toLowerCase();
  const uriText = process.env.SLIPWAY_AUTH_URI?.trim() || `https://${domain}`;
  try {
    const uri = new URL(uriText);
    const secureOrigin = uri.protocol === "https:";
    const localOrigin = uri.protocol === "http:" && ["localhost", "127.0.0.1"].includes(uri.hostname);
    if ((!secureOrigin && !localOrigin) || uri.host.toLowerCase() !== domain || uri.username || uri.password || uri.hash) return null;
    return { domain, uri: uri.toString() };
  } catch { return null; }
}
function workspaceMessage(wallet: string, nonce: string, issuedAt: string, expiresAt: string, chainId: number, domain: string, uri: string) {
  return `${domain} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to Slipway to access your saved drafts and watchlist.\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`;
}
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function validDraft(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && uuidPattern.test(row.id)
    && typeof row.name === "string" && row.name.trim().length > 0 && row.name.length <= 40
    && typeof row.symbol === "string" && /^[A-Za-z0-9]{1,10}$/.test(row.symbol)
    && typeof row.chain === "string" && supportedChains.has(row.chain)
    && typeof row.venue === "string" && row.venue.length <= 80
    && (row.description === undefined || (typeof row.description === "string" && row.description.length <= 500))
    && (row.image === undefined || (typeof row.image === "string" && row.image.length <= 2_800_000))
    && (row.createdAt === undefined || (typeof row.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt))));
}
function validWatch(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && uuidPattern.test(row.id)
    && typeof row.name === "string" && row.name.trim().length > 0 && row.name.length <= 40
    && typeof row.address === "string" && addressPattern.test(row.address)
    && typeof row.chain === "string" && supportedChains.has(row.chain);
}

workspaceRouter.post("/challenge", async (request, response) => {
  const wallet = request.body?.wallet;
  const chainId = request.body?.chainId;
  if (typeof wallet !== "string" || !isAddress(wallet) || ![4663, 8453, 46630022].includes(chainId)) {
    response.status(400).json({ error: "Provide a valid wallet and supported chain ID" });
    return;
  }
  const auth = siweConfig();
  if (!auth) { response.status(503).json({ error: "Wallet sign-in domain is not configured" }); return; }
  const normalized = getAddress(wallet).toLowerCase();
  const nonce = randomBytes(32).toString("hex");
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + challengeLifetimeMs).toISOString();
  const message = workspaceMessage(getAddress(wallet), nonce, issuedAt, expiresAt, chainId as number, auth.domain, auth.uri);
  try {
    await db.query("DELETE FROM wallet_workspace_sessions WHERE expires_at <= now()");
    await db.query("DELETE FROM wallet_workspace_challenges WHERE expires_at <= now()");
    const issued = await db.query(
      `INSERT INTO wallet_workspace_challenges (wallet_address, nonce, message, expires_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (wallet_address) DO UPDATE
       SET nonce = EXCLUDED.nonce, message = EXCLUDED.message, expires_at = EXCLUDED.expires_at, created_at = now()
       WHERE wallet_workspace_challenges.created_at < now() - interval '15 seconds' RETURNING nonce`,
      [normalized, nonce, message, expiresAt]
    );
    if (!issued.rowCount) { response.status(429).json({ error: "A wallet challenge was recently issued; try again shortly" }); return; }
    response.setHeader("Cache-Control", "no-store").json({ wallet: normalized, chainId, nonce, message, expiresAt });
  } catch {
    response.status(503).json({ error: "Wallet workspace authentication is temporarily unavailable" });
  }
});

workspaceRouter.post("/verify", async (request, response) => {
  const { wallet, nonce, signature } = request.body ?? {};
  if (typeof wallet !== "string" || !isAddress(wallet) || typeof nonce !== "string" || !/^[a-f0-9]{64}$/.test(nonce)
    || typeof signature !== "string" || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
    response.status(400).json({ error: "Provide the wallet challenge and its EVM signature" });
    return;
  }
  const normalized = getAddress(wallet).toLowerCase();
  try {
    const challenge = await db.query<{ message: string; expires_at: Date }>(
      "SELECT message, expires_at FROM wallet_workspace_challenges WHERE wallet_address = $1 AND nonce = $2 AND expires_at > now()",
      [normalized, nonce]
    );
    if (!challenge.rows[0]) { response.status(401).json({ error: "Wallet challenge is missing or expired" }); return; }
    let valid = false;
    try { valid = await verifyMessage({ address: getAddress(wallet), message: challenge.rows[0].message, signature: signature as `0x${string}` }); } catch {}
    if (!valid) { response.status(401).json({ error: "Wallet signature does not match the challenge" }); return; }
    const consumed = await db.query(
      "DELETE FROM wallet_workspace_challenges WHERE wallet_address = $1 AND nonce = $2 AND expires_at > now()",
      [normalized, nonce]
    );
    if (!consumed.rowCount) { response.status(401).json({ error: "Wallet challenge has already been used" }); return; }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString();
    await db.query("INSERT INTO wallet_workspace_sessions (token_hash, wallet_address, expires_at) VALUES ($1, $2, $3)", [tokenHash(token), normalized, expiresAt]);
    response.setHeader("Cache-Control", "no-store").json({ wallet: normalized, token, expiresAt });
  } catch {
    response.status(503).json({ error: "Wallet workspace authentication is temporarily unavailable" });
  }
});

export async function requireWorkspaceSession(request: Request, response: Response, next: NextFunction) {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(request.header("authorization") ?? "");
  if (!match) { response.status(401).json({ error: "Sign with your wallet to access its workspace" }); return; }
  try {
    const result = await db.query<{ wallet_address: string }>(
      "SELECT wallet_address FROM wallet_workspace_sessions WHERE token_hash = $1 AND expires_at > now()",
      [tokenHash(match[1]!)]
    );
    if (!result.rows[0]) { response.status(401).json({ error: "Wallet workspace session is missing or expired" }); return; }
    response.locals.walletAddress = result.rows[0].wallet_address;
    next();
  } catch {
    response.status(503).json({ error: "Wallet workspace is temporarily unavailable" });
  }
}

workspaceRouter.post("/revoke", requireWorkspaceSession, async (request, response) => {
  try {
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(request.header("authorization") ?? "");
    if (!match) { response.status(401).json({ error: "Wallet workspace session is missing" }); return; }
    await db.query("DELETE FROM wallet_workspace_sessions WHERE token_hash = $1", [tokenHash(match[1]!)]);
    response.setHeader("Cache-Control", "no-store").json({ revoked: true });
  } catch {
    response.status(503).json({ error: "Wallet workspace is temporarily unavailable" });
  }
});

workspaceRouter.use(requireWorkspaceSession);
workspaceRouter.get("/api-keys", async (_request, response) => {
  const wallet = response.locals.walletAddress as string;
  try {
    const result = await db.query<{ id: string; name: string; key_prefix: string; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>(
      `SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
       FROM developer_api_keys WHERE wallet_address = $1 ORDER BY created_at DESC`, [wallet]
    );
    response.setHeader("Cache-Control", "no-store").json({ keys: result.rows.map((row) => ({
      id: row.id, name: row.name, prefix: row.key_prefix, createdAt: row.created_at,
      lastUsedAt: row.last_used_at, revokedAt: row.revoked_at
    })) });
  } catch {
    response.status(503).json({ error: "API keys are temporarily unavailable" });
  }
});

workspaceRouter.post("/api-keys", async (request, response) => {
  const wallet = response.locals.walletAddress as string;
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  if (!name || name.length > 60) { response.status(400).json({ error: "Give this API key a name of up to 60 characters" }); return; }
  const key = `slw_live_${randomBytes(32).toString("base64url")}`;
  const id = randomUUID();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`developer-api-keys:${wallet}`]);
    const count = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM developer_api_keys WHERE wallet_address = $1 AND revoked_at IS NULL", [wallet]
    );
    if (Number(count.rows[0]?.count ?? 0) >= 10) {
      await client.query("ROLLBACK");
      response.status(409).json({ error: "A wallet can have up to 10 active API keys" }); return;
    }
    await client.query(
      `INSERT INTO developer_api_keys (id, wallet_address, name, key_hash, key_prefix)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, wallet, name, tokenHash(key), key.slice(0, 17)]
    );
    await client.query("COMMIT");
    response.setHeader("Cache-Control", "no-store").status(201).json({
      key,
      apiKey: { id, name, prefix: key.slice(0, 17), createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null }
    });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    response.status(503).json({ error: "API key could not be created right now" });
  } finally { client.release(); }
});

workspaceRouter.delete("/api-keys/:id", async (request, response) => {
  const wallet = response.locals.walletAddress as string;
  if (!uuidPattern.test(request.params.id)) { response.status(400).json({ error: "API key ID is invalid" }); return; }
  try {
    const result = await db.query(
      `UPDATE developer_api_keys SET revoked_at = now()
       WHERE id = $1 AND wallet_address = $2 AND revoked_at IS NULL RETURNING id`,
      [request.params.id, wallet]
    );
    if (!result.rowCount) { response.status(404).json({ error: "Active API key was not found" }); return; }
    response.setHeader("Cache-Control", "no-store").json({ revoked: true, id: request.params.id });
  } catch {
    response.status(503).json({ error: "API key could not be revoked right now" });
  }
});

workspaceRouter.get("/", async (_request, response) => {
  const wallet = response.locals.walletAddress as string;
  try {
    const result = await db.query<{ drafts: unknown[]; watches: unknown[]; updated_at: Date }>(
      "SELECT drafts, watches, updated_at FROM wallet_workspaces WHERE wallet_address = $1", [wallet]
    );
    const row = result.rows[0];
    response.setHeader("Cache-Control", "no-store").json({ wallet, exists: Boolean(row), drafts: row?.drafts ?? [], watches: row?.watches ?? [], updatedAt: row?.updated_at ?? null });
  } catch {
    response.status(503).json({ error: "Wallet workspace is temporarily unavailable" });
  }
});

workspaceRouter.put("/", async (request, response) => {
  const { drafts, watches } = request.body ?? {};
  if (!Array.isArray(drafts) || !Array.isArray(watches) || drafts.length > 100 || watches.length > 500
    || !drafts.every(validDraft) || !watches.every(validWatch)
    || Buffer.byteLength(JSON.stringify({ drafts, watches })) > maxWorkspaceBytes) {
    response.status(400).json({ error: "Workspace data is invalid or exceeds the storage limit" });
    return;
  }
  const wallet = response.locals.walletAddress as string;
  try {
    const result = await db.query(
      `INSERT INTO wallet_workspaces (wallet_address, drafts, watches, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, now()) ON CONFLICT (wallet_address) DO UPDATE
       SET drafts = EXCLUDED.drafts, watches = EXCLUDED.watches, updated_at = now()
       RETURNING updated_at AS "updatedAt"`,
      [wallet, JSON.stringify(drafts), JSON.stringify(watches)]
    );
    response.setHeader("Cache-Control", "no-store").json({ wallet, saved: true, updatedAt: result.rows[0]?.updatedAt });
  } catch {
    response.status(503).json({ error: "Wallet workspace is temporarily unavailable" });
  }
});
