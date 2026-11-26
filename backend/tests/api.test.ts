import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { app } from "../src/app";
import { setMarketFetcher, resetMarketBudget, setMarketBudgetEnforcedForTests } from "../src/routes/market";

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

  test("keeps valid trade quotes and builds paused until restricted routers are configured", async () => {
    const previous = process.env.SLIPWAY_TRADING_ENABLED;
    process.env.SLIPWAY_TRADING_ENABLED = "false";
    try {
      const quote = await apiFetch(`${origin}/v1/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "base", token: "0x000000000000000000000000000000000000dead", side: "buy", amount: "1", slippageBps: 50 })
      });
      const build = await apiFetch(`${origin}/v1/build/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: "00000000-0000-4000-8000-000000000001", wallet: "0x000000000000000000000000000000000000dead", accountKind: "eoa" })
      });
      expect(quote.status).toBe(503);
      expect(build.status).toBe(503);
      expect((await quote.json() as { error: string }).error).toContain("paused");
    } finally {
      if (previous === undefined) delete process.env.SLIPWAY_TRADING_ENABLED;
      else process.env.SLIPWAY_TRADING_ENABLED = previous;
    }
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

  test("proxies multi-token lookups with top pools only", async () => {
    let requested = "";
    setMarketFetcher(async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const a = `0x${"a".repeat(40)}`, b = `0x${"b".repeat(40)}`;
      const ok = await apiFetch(`${origin}/v1/market/networks/robinhood/tokens/multi/${a},${b}?include=top_pools`);
      expect(ok.status, await ok.clone().text()).toBe(200);
      expect(requested).toBe(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/multi/${a},${b}?include=top_pools`);
      const v4Pool = await apiFetch(`${origin}/v1/market/networks/robinhood/pools/0xe7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7?include=base_token%2Cquote_token`);
      expect(v4Pool.status, await v4Pool.clone().text()).toBe(200);
      const badInclude = await apiFetch(`${origin}/v1/market/networks/robinhood/tokens/multi/${a}?include=base_token,quote_token`);
      const badAddress = await apiFetch(`${origin}/v1/market/networks/robinhood/tokens/multi/not-an-address`);
      const tooMany = await apiFetch(`${origin}/v1/market/networks/robinhood/tokens/multi/${Array(31).fill(a).join(",")}`);
      expect(badInclude.status).toBe(400);
      expect(badAddress.status).toBe(400);
      expect(tooMany.status).toBe(400);
    } finally {
      setMarketFetcher();
    }
  });

  test("proxies pool trades with only a bounded size filter", async () => {
    let requested = "";
    setMarketFetcher(async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const pool = "0xe7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7";
      const ok = await apiFetch(`${origin}/v1/market/networks/robinhood/pools/${pool}/trades?trade_volume_in_usd_greater_than=100`);
      expect(ok.status, await ok.clone().text()).toBe(200);
      expect(requested).toBe(`https://api.geckoterminal.com/api/v2/networks/robinhood/pools/${pool}/trades?trade_volume_in_usd_greater_than=100`);
      const plain = await apiFetch(`${origin}/v1/market/networks/base/pools/${pool}/trades`);
      expect(plain.status).toBe(200);
      const badParam = await apiFetch(`${origin}/v1/market/networks/robinhood/pools/${pool}/trades?include=base_token`);
      const badValue = await apiFetch(`${origin}/v1/market/networks/robinhood/pools/${pool}/trades?trade_volume_in_usd_greater_than=-5`);
      expect(badParam.status).toBe(400);
      expect(badValue.status).toBe(400);
    } finally {
      setMarketFetcher();
    }
  });

  test("stops calling the provider after a 429 and answers busy instead", async () => {
    let calls = 0;
    resetMarketBudget();
    setMarketBudgetEnforcedForTests(true);
    setMarketFetcher(async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: { error_code: 429 } }), { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } });
    });
    try {
      const pool = `0x${"1".repeat(40)}`;
      const first = await apiFetch(`${origin}/v1/market/networks/base/pools/${pool}/ohlcv/hour?aggregate=1&limit=10`);
      const second = await apiFetch(`${origin}/v1/market/networks/base/pools/${pool}/ohlcv/day?aggregate=1&limit=10`);
      expect(first.status).toBe(503);
      expect(second.status).toBe(503);
      expect(second.headers.get("retry-after")).toBe("30");
      expect(calls).toBe(1);
    } finally {
      setMarketFetcher();
      setMarketBudgetEnforcedForTests(false);
      resetMarketBudget();
    }
  });

  test("limits upstream calls per minute", async () => {
    let calls = 0;
    resetMarketBudget();
    setMarketBudgetEnforcedForTests(true);
    setMarketFetcher(async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const statuses = [];
      for (let i = 0; i < 26; i += 1) {
        const pool = `0x${i.toString(16).padStart(40, "0")}`;
        statuses.push((await apiFetch(`${origin}/v1/market/networks/base/pools/${pool}`)).status);
      }
      expect(calls).toBe(24);
      expect(statuses.filter((s) => s === 503).length).toBe(2);
    } finally {
      setMarketFetcher();
      setMarketBudgetEnforcedForTests(false);
      resetMarketBudget();
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

  test("keeps x402 verification authenticated and rejects assets outside the configured allowlist", async () => {
    const names = ["X402_ENABLED", "X402_FACILITATOR_API_KEY", "X402_BASE_USDC_ADDRESS", "X402_BASE_PAY_TO"] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    process.env.X402_ENABLED = "true";
    process.env.X402_FACILITATOR_API_KEY = "x402-test-key";
    process.env.X402_BASE_USDC_ADDRESS = "0x00000000000000000000000000000000000000a1";
    process.env.X402_BASE_PAY_TO = "0x00000000000000000000000000000000000000b2";
    const requestBody = {
      x402Version: 2,
      paymentPayload: { accepted: { scheme: "exact", network: "eip155:8453", asset: "0x00000000000000000000000000000000000000ff", payTo: "0x00000000000000000000000000000000000000b2", amount: "10" } },
      paymentRequirements: { scheme: "exact", network: "eip155:8453", asset: "0x00000000000000000000000000000000000000ff", payTo: "0x00000000000000000000000000000000000000b2", amount: "10" }
    };
    try {
      const unauthorized = await apiFetch(`${origin}/v1/x402/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const disallowedAsset = await apiFetch(`${origin}/v1/x402/verify`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer x402-test-key" }, body: JSON.stringify(requestBody) });
      expect(unauthorized.status).toBe(401);
      expect(disallowedAsset.status).toBe(400);
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  });

  test("validates event feed filters before database access", async () => {
    const badCursor = await apiFetch(`${origin}/v1/events?after=-1`);
    const badChain = await apiFetch(`${origin}/v1/events?chain=solana`);
    const badType = await apiFetch(`${origin}/v1/events?types=admin.secret`);
    const badWallet = await apiFetch(`${origin}/v1/events?wallet=not-a-wallet`);
    const badOrder = await apiFetch(`${origin}/v1/events?order=random`);
    expect(badCursor.status).toBe(400);
    expect(badChain.status).toBe(400);
    expect(badType.status).toBe(400);
    expect(badWallet.status).toBe(400);
    expect(badOrder.status).toBe(400);
  });
});
