import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { app } from "../src/app";
import { setMarketFetcher } from "../src/routes/market";

describe("backend API surface", () => {
  let server: ReturnType<typeof app.listen>;
  let origin: string;
  const apiKey = "unit-test-api-key";
  let previousApiKey: string | undefined;
  const apiFetch = (url: string, init: RequestInit = {}) => fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), "x-api-key": apiKey } });

  beforeAll(async () => {
    previousApiKey = process.env.SERVER_API_KEY;
    process.env.SERVER_API_KEY = apiKey;
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (previousApiKey === undefined) delete process.env.SERVER_API_KEY; else process.env.SERVER_API_KEY = previousApiKey;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  test("keeps health public and gates other API paths behind the server key", async () => {
    const health = await fetch(`${origin}/health`);
    const denied = await fetch(`${origin}/v1/chains`);
    const wrongKey = await fetch(`${origin}/v1/chains`, { headers: { "x-api-key": "wrong-key" } });
    expect(health.status).toBe(200);
    expect(denied.status).toBe(401);
    expect(wrongKey.status).toBe(401);
  });

  test("lists Base and Robinhood Chain only", async () => {
    const response = await apiFetch(`${origin}/v1/chains`);
    expect(response.status).toBe(200);
    const chains = await response.json() as Array<{ id: string; chainId: number }>;
    expect(chains.map((chain) => [chain.id, chain.chainId])).toEqual([["rhc", 4663], ["base", 8453]]);
  });

  test("rejects unsupported chains and malformed EVM addresses", async () => {
    const unsupported = await apiFetch(`${origin}/v1/tokens/solana/anything`);
    const malformed = await apiFetch(`${origin}/v1/tokens/base/anything`);
    expect(unsupported.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  test("rejects unsupported quote inputs without reaching an RPC", async () => {
    const response = await apiFetch(`${origin}/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "solana", token: "bad", side: "buy", amount: "1", slippageBps: 50 })
    });
    expect(response.status).toBe(400);
  });

  test("rejects malformed build requests before database access", async () => {
    const response = await apiFetch(`${origin}/v1/build/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "not-a-uuid", wallet: "bad", accountKind: "kernel4337" })
    });
    expect(response.status).toBe(400);
  });

  test("rejects unsupported quote assets before RPC access", async () => {
    const response = await apiFetch(`${origin}/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "base", token: "0x000000000000000000000000000000000000dead", side: "buy", amount: "1", quoteAsset: "BNB", slippageBps: 50 })
    });
    expect(response.status).toBe(400);
  });

  test("rejects unsupported launch venue and chain combinations before RPC access", async () => {
    const response = await apiFetch(`${origin}/v1/launch/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue: "pons", chain: 8453, wallet: "0x000000000000000000000000000000000000dead", name: "Token", symbol: "TKN", metadataUri: "ipfs://token" })
    });
    expect(response.status).toBe(400);
  });

  test("rejects malformed launch build requests before database access", async () => {
    const response = await apiFetch(`${origin}/v1/build/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ launchQuoteId: "invalid", wallet: "bad", accountKind: "kernel4337" })
    });
    expect(response.status).toBe(400);
  });

  test("proxies approved market requests to the fixed provider origin", async () => {
    let requested = "";
    setMarketFetcher(async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const response = await apiFetch(`${origin}/v1/market/networks/base/trending_pools?include=base_token%2Cquote_token`);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=15");
      expect(requested).toBe("https://api.geckoterminal.com/api/v2/networks/base/trending_pools?include=base_token%2Cquote_token");
    } finally {
      setMarketFetcher();
    }
  });

  test("rejects arbitrary market routes and upstream query parameters", async () => {
    const unknown = await apiFetch(`${origin}/v1/market/proxy/https://example.com`);
    const unsafeQuery = await apiFetch(`${origin}/v1/market/search/pools?query=token&url=https://example.com`);
    expect(unknown.status).toBe(400);
    expect(unsafeQuery.status).toBe(400);
  });

  test("validates transaction submission and status requests before RPC access", async () => {
    const invalidSubmission = await apiFetch(`${origin}/v1/transactions/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "base", signedTransaction: "0xnot-a-signed-transaction" })
    });
    const invalidChain = await apiFetch(`${origin}/v1/transactions/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "solana", signedTransaction: "0x02" })
    });
    const invalidHash = await apiFetch(`${origin}/v1/transactions/base/not-a-hash`);
    expect(invalidSubmission.status).toBe(400);
    expect(invalidChain.status).toBe(400);
    expect(invalidHash.status).toBe(400);
  });

  test("validates wallet workspace authentication inputs before database access", async () => {
    const challenge = await apiFetch(`${origin}/v1/workspace/challenge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: "bad" }) });
    const verify = await apiFetch(`${origin}/v1/workspace/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: "bad", nonce: "bad", signature: "bad" }) });
    const workspace = await apiFetch(`${origin}/v1/workspace`);
    expect(challenge.status).toBe(400);
    expect(verify.status).toBe(400);
    expect(workspace.status).toBe(401);
  });

  test("validates event feed filters before database access", async () => {
    const badCursor = await apiFetch(`${origin}/v1/events?after=-1`);
    const badChain = await apiFetch(`${origin}/v1/events?chain=solana`);
    const badType = await apiFetch(`${origin}/v1/events?types=admin.secret`);
    expect(badCursor.status).toBe(400);
    expect(badChain.status).toBe(400);
    expect(badType.status).toBe(400);
  });
});
