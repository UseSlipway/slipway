import { Router } from "express";
import { getX402Facilitator } from "../x402/facilitator";

export const x402Router = Router();

x402Router.get("/supported", (_request, response) => {
  response.setHeader("Cache-Control", "public, max-age=30");
  response.json(getX402Facilitator().getSupported());
});
