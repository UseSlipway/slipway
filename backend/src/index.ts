import "dotenv/config";
import { app } from "./app";
import { migrate } from "./db/migrate";
import { configureX402Facilitator } from "./x402/facilitator";

const port = Number(process.env.PORT ?? 3001);
const commit = process.env.APP_COMMIT_SHA ?? "unknown";
console.info(JSON.stringify({ event: "service_starting", commit, nodeEnv: process.env.NODE_ENV ?? "development" }));
await migrate();
console.info(JSON.stringify({ event: "database_migrations_complete", commit }));
await configureX402Facilitator();
app.listen(port, () => console.info(JSON.stringify({
  event: "service_started",
  app: "slipway-api",
  port,
  commit,
  x402Enabled: process.env.X402_ENABLED === "true",
  chains: [4663, 8453]
})));
