import { Router } from "express";

export const apiRouter = Router();
apiRouter.get("/", (_request, response) => {
  response.json({ name: "Slipway API", version: "v1", status: "scaffold" });
});
