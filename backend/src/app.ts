import express from "express";
import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { publicChainConfig, getChainConfig, getRestrictedFeeRouterAddress } from "./chains/config";
import { healthRouter } from "./routes/health";
import { apiRouter } from "./routes/v1";
import { tokenRouter } from "./routes/tokens";
import { tradeRouter } from "./routes/trades";
import { marketRouter } from "./routes/market";
import { transactionRouter } from "./routes/transactions";
import { eventRouter } from "./routes/events";
import { launchRouter } from "./routes/launches";
import { x402Router } from "./routes/x402";
import { workspaceRouter } from "./routes/workspace";
import { mediaRouter } from "./routes/media";
import { publicApiRouter } from "./routes/publicApi";
import { trendingRouter } from "./routes/trending";
import { creatorProfileRouter } from "./routes/creatorProfiles";
import { ponsProgressRouter } from "./routes/ponsProgress";
import { holderRouter } from "./routes/holders";

export const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  const requestId = randomUUID();
  const startedAt = performance.now();
  response.setHeader("x-request-id", requestId);
  response.on("finish", () => {
    console.info(JSON.stringify({
      event: "http_request",
      requestId,
      method: request.method,
      path: new URL(request.originalUrl, "http://localhost").pathname,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
      commit: process.env.APP_COMMIT_SHA ?? "unknown"
    }));
  });
  next();
});
app.use("/health", healthRouter);
app.use((request, response, next) => {
  const pathname = new URL(request.originalUrl, "http://localhost").pathname;
  if (pathname === "/health" || pathname === "/health/" || pathname === "/public/v1" || pathname.startsWith("/public/v1/")) return next();
  const configured = process.env.SERVER_API_KEY;
  if (!configured) {
    response.status(503).json({ error: "API authentication is not configured" });
    return;
  }
  const supplied = request.header("x-api-key") ?? "";
  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    response.status(401).json({ error: "API key is invalid or missing" });
    return;
  }
  next();
});
app.use(express.json({ limit: "4mb" }));
app.get("/ready/", async (_request, response) => {
  const checks: Record<string, "ok" | "unavailable"> = {};
  try {
    const { db } = await import("./db/index");
    await db.query("SELECT 1");
    checks.database = "ok";
  } catch {
    checks.database = "unavailable";
  }
  for (const id of ["rhc", "base", "spcx"] as const) {
    const config = getChainConfig(id)!;
    try {
      const { getPublicClient } = await import("./chains/config");
      const client = getPublicClient(config);
      const chainId = await client.getChainId();
      checks[`${id}Rpc`] = chainId === config.chainId ? "ok" : "unavailable";
      if (config.uniswapV3) {
        const factoryCode = await client.getCode({ address: config.uniswapV3.factory });
        checks[`${id}UniswapV3`] = factoryCode && factoryCode !== "0x" ? "ok" : "unavailable";
      }
      if (config.restrictedFeeRouterAddress) {
        const feeRouterCode = await client.getCode({ address: getRestrictedFeeRouterAddress(config) });
        checks[`${id}FeeRouter`] = feeRouterCode && feeRouterCode !== "0x" ? "ok" : "unavailable";
      }
      if (config.orbit && config.stoxswap) {
        const contracts = await Promise.all([config.orbit.factory, config.orbit.engine, config.orbit.poolImplementation, config.orbit.vault, config.stoxswap.factory, config.stoxswap.router, config.stoxswap.wrappedNative].map((address) => client.getCode({ address })));
        checks[`${id}Orbit`] = contracts.slice(0, 4).every((code) => Boolean(code && code !== "0x")) ? "ok" : "unavailable";
        checks[`${id}StoxSwap`] = contracts.slice(4).every((code) => Boolean(code && code !== "0x")) ? "ok" : "unavailable";
      }
    } catch {
      checks[`${id}Rpc`] = "unavailable";
      if (config.uniswapV3) checks[`${id}UniswapV3`] = "unavailable";
      if (config.restrictedFeeRouterAddress) checks[`${id}FeeRouter`] = "unavailable";
      if (config.orbit) checks[`${id}Orbit`] = "unavailable";
      if (config.stoxswap) checks[`${id}StoxSwap`] = "unavailable";
    }
  }
  const ready = Object.values(checks).every((status) => status === "ok");
  response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "degraded", checks });
});
app.use("/v1/workspace", workspaceRouter);
app.use("/v1", mediaRouter);
app.use("/v1", apiRouter);
app.get("/v1/chains", (_request, response) => {
  response.json(["rhc", "base", "spcx"].map((id) => publicChainConfig(getChainConfig(id)!)));
});
app.use("/v1/tokens", tokenRouter);
app.use("/v1", tradeRouter);
app.use("/v1/market", marketRouter);
app.use("/v1/transactions", transactionRouter);
app.use("/v1/events", eventRouter);
app.use("/v1/trending", trendingRouter);
app.use("/v1/creators/profile", creatorProfileRouter);
app.use("/v1/pons", ponsProgressRouter);
app.use("/v1/holders", holderRouter);
app.use("/v1", launchRouter);
app.use("/v1/x402", x402Router);
app.use("/public/v1", publicApiRouter);

app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(JSON.stringify({
    event: "request_error",
    requestId: response.getHeader("x-request-id"),
    errorType: error instanceof Error ? error.name : "unknown"
  }));
  response.status(500).json({ error: "Internal server error" });
});
