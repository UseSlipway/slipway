import "dotenv/config";
import { app } from "./app";
import { migrate } from "./db/migrate";

const port = Number(process.env.PORT ?? 3001);
await migrate();
app.listen(port, () => console.info(`Slipway API listening on ${port}`));
