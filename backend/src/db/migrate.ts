import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { db } from "./index";

const migrationsDirectory = join(import.meta.dir, "../../db/migrations");

export async function migrate(): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["slipway:migrations"]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
    for (const filename of files) {
      const prior = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [filename]);
      if (prior.rowCount) continue;
      await client.query(await Bun.file(join(migrationsDirectory, filename)).text());
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
