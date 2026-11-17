import "dotenv/config";
import { app } from "./app";
import { migrate } from "./db/migrate";
import { configureX402Facilitator } from "./x402/facilitator";

const port = Number(process.env.PORT ?? 3001);
await migrate();
await configureX402Facilitator();
app.listen(port, () => console.info(`Slipway API listening on ${port}`));
