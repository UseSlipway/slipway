import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { app } from "../src/app";

describe("backend API surface", () => {
  let server: ReturnType<typeof app.listen>;
  let origin: string;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  test("lists Base and Robinhood Chain only", async () => {
    const response = await fetch(`${origin}/v1/chains`);
    expect(response.status).toBe(200);
    const chains = await response.json() as Array<{ id: string; chainId: number }>;
    expect(chains.map((chain) => [chain.id, chain.chainId])).toEqual([["rhc", 4663], ["base", 8453]]);
  });

  test("rejects unsupported chains and malformed EVM addresses", async () => {
    const unsupported = await fetch(`${origin}/v1/tokens/solana/anything`);
    const malformed = await fetch(`${origin}/v1/tokens/base/anything`);
    expect(unsupported.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  test("rejects unsupported quote inputs without reaching an RPC", async () => {
    const response = await fetch(`${origin}/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "solana", token: "bad", side: "buy", amount: "1", slippageBps: 50 })
    });
    expect(response.status).toBe(400);
  });

  test("rejects malformed build requests before database access", async () => {
    const response = await fetch(`${origin}/v1/build/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "not-a-uuid", wallet: "bad", accountKind: "kernel4337" })
    });
    expect(response.status).toBe(400);
  });

  test("rejects unsupported quote assets before RPC access", async () => {
    const response = await fetch(`${origin}/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "base", token: "0x000000000000000000000000000000000000dead", side: "buy", amount: "1", quoteAsset: "BNB", slippageBps: 50 })
    });
    expect(response.status).toBe(400);
  });
});
