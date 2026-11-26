import { Router } from "express";
import { publicChainConfig, getChainConfig } from "../chains/config";
import { requireDeveloperApiKey } from "../middleware/developerApiKey";
import { tokenRouter } from "./tokens";
import { tradeRouter } from "./trades";
import { marketRouter } from "./market";
import { eventRouter } from "./events";
import { launchRouter } from "./launches";
import { transactionRouter } from "./transactions";

export const publicApiRouter = Router();
publicApiRouter.use(requireDeveloperApiKey);
publicApiRouter.get("/", (_request, response) => {
  response.json({ name: "Slipway Public API", version: "v1", authentication: "Bearer API key", rateLimit: "120 requests per minute" });
});
publicApiRouter.get("/chains", (_request, response) => {
  response.json(["rhc", "base"].map((id) => publicChainConfig(getChainConfig(id)!)));
});
publicApiRouter.use("/tokens", tokenRouter);
publicApiRouter.use("/market", marketRouter);
publicApiRouter.use("/events", eventRouter);
publicApiRouter.use("/transactions", transactionRouter);
publicApiRouter.use("/", tradeRouter);
publicApiRouter.use("/", launchRouter);
