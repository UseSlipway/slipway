import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { getX402Facilitator, isX402Enabled } from "../x402/facilitator";

export const x402Router = Router();
const requestSchema = z.object({
  x402Version: z.literal(2),
  paymentPayload: z.record(z.string(), z.unknown()),
  paymentRequirements: z.record(z.string(), z.unknown())
}).strict();

function authorized(authorization: string | undefined): boolean {
  const expected = process.env.X402_FACILITATOR_API_KEY;
  if (!expected) return false;
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return false;
  const actual = authorization.slice(prefix.length);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function requireEnabled(response: import("express").Response): boolean {
  if (isX402Enabled()) return true;
  response.status(503).json({ error: "Facilitator is disabled" });
  return false;
}

function requireAuth(request: import("express").Request, response: import("express").Response): boolean {
  if (authorized(request.header("authorization"))) return true;
  response.setHeader("WWW-Authenticate", "Bearer");
  response.status(401).json({ error: "Facilitator authentication required" });
  return false;
}

function paymentRequest(request: import("express").Request, response: import("express").Response) {
  const parsed = requestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid x402 facilitator request" });
    return undefined;
  }
  const paymentPayload = parsed.data.paymentPayload as unknown as PaymentPayload;
  const paymentRequirements = parsed.data.paymentRequirements as unknown as PaymentRequirements;
  const accepted = paymentPayload.accepted;
  const supportedPayments: Record<string, { asset?: string; payTo?: string }> = {
    "eip155:4663": { asset: process.env.X402_RHC_USDG_ADDRESS, payTo: process.env.X402_RHC_PAY_TO },
    "eip155:8453": { asset: process.env.X402_BASE_USDC_ADDRESS, payTo: process.env.X402_BASE_PAY_TO }
  };
  const network = paymentRequirements.network;
  const configuredPayment = supportedPayments[network];
  if (
    paymentRequirements.scheme !== "exact" ||
    accepted?.scheme !== "exact" ||
    accepted?.network !== network ||
    !configuredPayment?.asset ||
    !configuredPayment.payTo ||
    paymentRequirements.asset?.toLowerCase() !== configuredPayment.asset.toLowerCase() ||
    accepted.asset?.toLowerCase() !== configuredPayment.asset.toLowerCase() ||
    paymentRequirements.payTo?.toLowerCase() !== configuredPayment.payTo.toLowerCase() ||
    accepted.payTo?.toLowerCase() !== configuredPayment.payTo.toLowerCase() ||
    accepted.amount !== paymentRequirements.amount
  ) {
    response.status(400).json({ error: "Unsupported x402 network, scheme, or asset" });
    return undefined;
  }
  return { paymentPayload, paymentRequirements };
}

x402Router.get("/supported", (_request, response) => {
  response.setHeader("Cache-Control", "public, max-age=30");
  response.json(getX402Facilitator().getSupported());
});

x402Router.post("/verify", async (request, response) => {
  if (!requireEnabled(response) || !requireAuth(request, response)) return;
  const payment = paymentRequest(request, response);
  if (!payment) return;
  try {
    response.json(await getX402Facilitator().verify(payment.paymentPayload, payment.paymentRequirements));
  } catch {
    response.status(503).json({ isValid: false, invalidReason: "verification_unavailable" });
  }
});

x402Router.post("/settle", async (request, response) => {
  if (!requireEnabled(response) || !requireAuth(request, response)) return;
  const payment = paymentRequest(request, response);
  if (!payment) return;
  try {
    response.json(await getX402Facilitator().settle(payment.paymentPayload, payment.paymentRequirements));
  } catch {
    response.status(503).json({ success: false, errorReason: "settlement_unavailable" });
  }
});
