import { createHash } from "node:crypto";
import type { Request } from "express";
import { db } from "../db/index";

export function clientRateSubject(request: Request) {
  return request.header("x-slipway-client-ip") ?? request.socket.remoteAddress ?? "unknown";
}

export async function consumeDatabaseRateLimit(scope: string, subject: string, limit: number, windowSeconds: number) {
  const subjectHash = createHash("sha256").update(subject).digest("hex");
  const windowNumber = Math.floor(Date.now() / (windowSeconds * 1000));
  const result = await db.query<{ request_count: number }>(
    `INSERT INTO api_rate_limits (scope, subject_hash, window_number, request_count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (scope, subject_hash) DO UPDATE SET
       request_count = CASE WHEN api_rate_limits.window_number = EXCLUDED.window_number
         THEN api_rate_limits.request_count + 1 ELSE 1 END,
       window_number = EXCLUDED.window_number,
       updated_at = now()
     RETURNING request_count`,
    [scope, subjectHash, windowNumber]
  );
  if (Math.random() < 0.01) {
    void db.query("DELETE FROM api_rate_limits WHERE updated_at < now() - interval '2 days'").catch(() => {});
  }
  return Number(result.rows[0]?.request_count ?? 0) > limit;
}
