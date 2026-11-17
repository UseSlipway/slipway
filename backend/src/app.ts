import express from "express";
import { healthRouter } from "./routes/health";
import { apiRouter } from "./routes/v1";
import { x402Router } from "./routes/x402";

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use("/health", healthRouter);
app.use("/v1", apiRouter);
app.use("/v1/x402", x402Router);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("request_error", error instanceof Error ? error.message : "unknown error");
  response.status(500).json({ error: "Internal server error" });
});
