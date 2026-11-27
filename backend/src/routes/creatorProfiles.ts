import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index";
import { requireWorkspaceSession } from "./workspace";
import { consumeDatabaseRateLimit } from "../middleware/rateLimit";

// Verified creator profiles. Anyone can read one; only the wallet recorded onchain as the token's
// creator (Pons deployer, Clanker tokenAdmin) can write it, proven by a signed workspace session.
export const creatorProfileRouter = Router();

const tokenExpr = "lower(coalesce(payload->'args'->>'token', payload->'args'->>'tokenAddress'))";
const creatorExpr = "lower(coalesce(payload->'args'->>'deployer', payload->'args'->>'tokenAdmin'))";
const chainSchema = z.enum(["rhc", "base"]);
const tokenSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const https = (host?: RegExp) => z.string().max(200).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (!host || host.test(url.hostname));
  } catch { return false }
}, "Use a full https:// link");
export const profileSchema = z.object({
  chain: chainSchema,
  token: tokenSchema,
  description: z.string().max(280).default(""),
  website: https().default(""),
  x: https(/^(www\.)?(x|twitter)\.com$/).default(""),
  telegram: https(/^(www\.)?(t\.me|telegram\.me)$/).default(""),
  bannerUrl: https(/^res\.cloudinary\.com$/).default(""),
}).strict();

async function onchainCreator(chain: string, token: string) {
  const result = await db.query<{ creator: string | null }>(
    `SELECT ${creatorExpr} AS creator FROM chain_events
     WHERE chain = $1 AND event_type = 'token.launched' AND ${tokenExpr} = $2 ORDER BY id ASC LIMIT 1`,
    [chain, token.toLowerCase()],
  );
  return result.rows[0]?.creator ?? null;
}

function publicProfile(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    chain: row.chain, token: row.token_address, creator: row.creator_address,
    description: row.description, website: row.website, x: row.x, telegram: row.telegram, bannerUrl: row.banner_url,
    updatedAt: row.updated_at, verified: row.verified === true,
  };
}

creatorProfileRouter.get("/", async (request, response) => {
  const chain = chainSchema.safeParse(request.query.chain);
  const token = tokenSchema.safeParse(request.query.token);
  if (!chain.success || !token.success) { response.status(400).json({ error: "Provide a supported chain and token address" }); return; }
  try {
    // A profile is shown as verified only while its author is still the onchain creator.
    const result = await db.query(
      `SELECT p.*, (p.creator_address = (
         SELECT ${creatorExpr} FROM chain_events WHERE chain = p.chain AND event_type = 'token.launched' AND ${tokenExpr} = p.token_address ORDER BY id ASC LIMIT 1
       )) AS verified
       FROM creator_profiles p WHERE p.chain = $1 AND p.token_address = $2`,
      [chain.data, token.data.toLowerCase()],
    );
    response.setHeader("Cache-Control", "public, max-age=30").json({ profile: publicProfile(result.rows[0]) });
  } catch {
    response.status(503).json({ error: "Creator profiles are temporarily unavailable" });
  }
});

creatorProfileRouter.put("/", requireWorkspaceSession, async (request, response) => {
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message === "Use a full https:// link" ? `Use a full https:// link for ${parsed.error.issues[0]?.path.join(".")}` : "Check the profile fields and try again" });
    return;
  }
  const wallet = String(response.locals.walletAddress).toLowerCase();
  const { chain, token, description, website, x, telegram, bannerUrl } = parsed.data;
  try {
    if (await consumeDatabaseRateLimit("creator-profile", wallet, 20, 60 * 60)) {
      response.setHeader("Retry-After", "3600").status(429).json({ error: "Too many profile updates. Try again later." });
      return;
    }
    const creator = await onchainCreator(chain, token);
    if (!creator) { response.status(404).json({ error: "Slipway has no launch record for this token yet, so the creator can't be confirmed." }); return; }
    if (creator !== wallet) { response.status(403).json({ error: "Only the wallet that launched this token can edit its profile." }); return; }
    const result = await db.query(
      `INSERT INTO creator_profiles (chain, token_address, creator_address, description, website, x, telegram, banner_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (chain, token_address) DO UPDATE SET creator_address = EXCLUDED.creator_address,
         description = EXCLUDED.description, website = EXCLUDED.website, x = EXCLUDED.x, telegram = EXCLUDED.telegram,
         banner_url = EXCLUDED.banner_url, updated_at = now()
       RETURNING *, true AS verified`,
      [chain, token.toLowerCase(), wallet, description.trim(), website, x, telegram, bannerUrl],
    );
    response.setHeader("Cache-Control", "no-store").json({ profile: publicProfile(result.rows[0]) });
  } catch {
    response.status(503).json({ error: "Creator profiles are temporarily unavailable" });
  }
});

creatorProfileRouter.delete("/", requireWorkspaceSession, async (request, response) => {
  const chain = chainSchema.safeParse(request.query.chain);
  const token = tokenSchema.safeParse(request.query.token);
  if (!chain.success || !token.success) { response.status(400).json({ error: "Provide a supported chain and token address" }); return; }
  const wallet = String(response.locals.walletAddress).toLowerCase();
  try {
    const creator = await onchainCreator(chain.data, token.data);
    if (creator !== wallet) { response.status(403).json({ error: "Only the wallet that launched this token can remove its profile." }); return; }
    await db.query("DELETE FROM creator_profiles WHERE chain = $1 AND token_address = $2", [chain.data, token.data.toLowerCase()]);
    response.setHeader("Cache-Control", "no-store").json({ profile: null });
  } catch {
    response.status(503).json({ error: "Creator profiles are temporarily unavailable" });
  }
});
