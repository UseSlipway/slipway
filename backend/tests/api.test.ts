import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { app } from "../src/app";
import { setMarketFetcher } from "../src/routes/market";

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

  test("proxies approved market requests to the fixed provider origin", async () => {
    let requested = "";
    setMarketFetcher(async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const response = await fetch(`${origin}/v1/market/networks/base/trending_pools?include=base_token%2Cquote_token`);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=15");
      expect(requested).toBe("https://api.geckoterminal.com/api/v2/networks/base/trending_pools?include=base_token%2Cquote_token");
    } finally {
      setMarketFetcher();
    }
  });

  test("rejects arbitrary market routes and upstream query parameters", async () => {
    const unknown = await fetch(`${origin}/v1/market/proxy/https://example.com`);
    const unsafeQuery = await fetch(`${origin}/v1/market/search/pools?query=token&url=https://example.com`);
    expect(unknown.status).toBe(400);
    expect(unsafeQuery.status).toBe(400);
  });

  test("validates transaction submission and status requests before RPC access", async () => {
    const invalidSubmission = await fetch(`${origin}/v1/transactions/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "base", signedTransaction: "0xnot-a-signed-transaction" })
    });
    const invalidChain = await fetch(`${origin}/v1/transactions/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "solana", signedTransaction: "0x02" })
    });
    const invalidHash = await fetch(`${origin}/v1/transactions/base/not-a-hash`);
    expect(invalidSubmission.status).toBe(400);
    expect(invalidChain.status).toBe(400);
    expect(invalidHash.status).toBe(400);
  });

  test("validates event feed filters before database access", async () => {
    const badCursor = await fetch(`${origin}/v1/events?after=-1`);
    const badChain = await fetch(`${origin}/v1/events?chain=solana`);
    const badType = await fetch(`${origin}/v1/events?types=admin.secret`);
    expect(badCursor.status).toBe(400);
    expect(badChain.status).toBe(400);
    expect(badType.status).toBe(400);
  });
});
