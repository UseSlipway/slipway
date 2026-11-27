import { createPublicClient, defineChain, getAddress, http, parseAbiItem, type Address, type Log, type PublicClient } from "viem";
import { getChainConfig, getPublicClient, type SlipwayChainId } from "../chains/config";
import { db } from "../db/index";
import { scanLegacyRouterActivity } from "./legacyRouterMonitor";

const ponsFactory = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" as Address;
const clankerV4Factory = "0xe85a59c628f7d27878aceb4bf3b35733630083a9" as Address;
const orbitLaunch = parseAbiItem("event TokenLaunched(address indexed token, address indexed pool, address indexed creator, bytes32 salt, uint256 supply, string metadata)");
const ponsLaunch = parseAbiItem("event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)");
const ponsGraduation = parseAbiItem("event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)");
const clankerLaunch = parseAbiItem("event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)");
const v4Initialize = parseAbiItem("event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)");
const maxLogRange = 100n;
const sources: Array<{ id: string; chain: SlipwayChainId; address: Address; events: Array<{ event: typeof ponsLaunch | typeof ponsGraduation | typeof clankerLaunch | typeof v4Initialize | typeof orbitLaunch; type: string }> }> = [
  { id: "pons-v2-rhc", chain: "rhc", address: ponsFactory, events: [{ event: ponsLaunch, type: "token.launched" }, { event: ponsGraduation, type: "pool.graduated" }] },
  { id: "clanker-v4-base", chain: "base", address: clankerV4Factory, events: [{ event: clankerLaunch, type: "token.launched" }] },
  { id: "uniswap-v4-pools-base", chain: "base", address: getAddress("0x498581ff718922c3f8e6a244956af099b2652b2b"), events: [{ event: v4Initialize, type: "pool.initialized" }] },
  { id: "uniswap-v4-pools-rhc", chain: "rhc", address: getAddress("0x8366a39cc670b4001a1121b8f6a443a643e40951"), events: [{ event: v4Initialize, type: "pool.initialized" }] },
  { id: "orbit-launchpad-spcx", chain: "spcx", address: getAddress("0xc79e983385d6ef11a1d50a8f9807d2968cd6e8fa"), events: [{ event: orbitLaunch, type: "token.launched" }] },
];

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, child) => typeof child === "bigint" ? child.toString() : child));
}

function errorSummary(error: unknown) {
  const value = error instanceof Error ? error : new Error(String(error));
  const cause = value.cause instanceof Error ? value.cause : undefined;
  const urls = [process.env.RHC_RPC_URL, process.env.BASE_RPC_URL, process.env.SPCX_RPC_URL].filter((url): url is string => Boolean(url));
  const redact = (message: string) => urls.reduce((clean, url) => clean.replaceAll(url, "[RPC_URL]"), message).replace(/https?:\/\/\S+/g, "[RPC_URL]").slice(0, 300);
  return {
    errorType: value.name,
    message: redact((value as Error & { shortMessage?: string }).shortMessage ?? value.message),
    causeType: cause?.name,
    causeMessage: cause ? redact((cause as Error & { shortMessage?: string }).shortMessage ?? cause.message) : undefined,
    rpcCode: (value as Error & { code?: number | string }).code
  };
}

async function getLogsWithRangeFallback(source: typeof sources[number], event: typeof ponsLaunch | typeof ponsGraduation | typeof clankerLaunch | typeof v4Initialize | typeof orbitLaunch, fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
  const client = getPublicClient(getChainConfig(source.chain)!);
  try {
    return await client.getLogs({ address: source.address, event, fromBlock, toBlock }) as Log[];
  } catch (error) {
    if (fromBlock < toBlock && isLogRangeLimitError(error)) {
      const midpoint = fromBlock + (toBlock - fromBlock) / 2n;
      return [
        ...await getLogsWithRangeFallback(source, event, fromBlock, midpoint),
        ...await getLogsWithRangeFallback(source, event, midpoint + 1n, toBlock)
      ];
    }
    const failure = new Error(`eth_getLogs failed for ${source.id} at block ${fromBlock}`, { cause: error });
    Object.assign(failure, { source: source.id, chain: source.chain, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() });
    throw failure;
  }
}

function isLogRangeLimitError(error: unknown): boolean {
  const messages: string[] = [];
  let current: unknown = error;
  while (current && typeof current === "object") {
    const item = current as { message?: unknown; shortMessage?: unknown; details?: unknown; cause?: unknown };
    for (const value of [item.shortMessage, item.message, item.details]) {
      if (typeof value === "string") messages.push(value);
    }
    current = item.cause;
  }
  return /(?:block|log|result|response).{0,80}(?:range|limit|too many|too large|exceed)|(?:range|limit|too many|too large|exceed).{0,80}(?:block|log|result|response)/i.test(messages.join(" "));
}

async function scanSource(source: typeof sources[number]) {
  const config = getChainConfig(source.chain)!;
  const client = getPublicClient(config);
  const head = await client.getBlockNumber();
  const safeHead = head > 3n ? head - 3n : head;
  const existing = await db.query<{ last_block: string }>("SELECT last_block FROM chain_event_cursors WHERE source = $1", [source.id]);
  let cursor = existing.rows[0] ? BigInt(existing.rows[0].last_block) : safeHead - 1n;
  if (!existing.rows[0]) {
    await db.query(
      "INSERT INTO chain_event_cursors (source, chain, last_block) VALUES ($1, $2, $3) ON CONFLICT (source) DO NOTHING",
      [source.id, source.chain, cursor.toString()]
    );
    const raced = await db.query<{ last_block: string }>("SELECT last_block FROM chain_event_cursors WHERE source = $1", [source.id]);
    cursor = BigInt(raced.rows[0]!.last_block);
  }
  if (cursor >= safeHead) return;

  const fromBlock = cursor + 1n;
  const toBlock = fromBlock + maxLogRange - 1n < safeHead ? fromBlock + maxLogRange - 1n : safeHead;
  const logsByType = await Promise.all(source.events.map(async ({ event, type }) => ({
    type,
    logs: await getLogsWithRangeFallback(source, event, fromBlock, toBlock),
  })));
  await storeLogs(source, logsByType, fromBlock, toBlock);
  await db.query("UPDATE chain_event_cursors SET last_block = $2, updated_at = now() WHERE source = $1", [source.id, toBlock.toString()]);
}

// Block time for each log, so history shows when events happened rather than when they were indexed.
// Reads the two chunk boundaries and interpolates; Robinhood Chain and Base produce blocks at a steady pace.
async function blockTimer(source: typeof sources[number], fromBlock: bigint, toBlock: bigint, client: PublicClient = getPublicClient(getChainConfig(source.chain)!)) {
  try {
    const [from, to] = await Promise.all([client.getBlock({ blockNumber: fromBlock }), client.getBlock({ blockNumber: toBlock })]);
    const span = Number(toBlock - fromBlock) || 1;
    return (block: bigint | null | undefined) => {
      if (block == null) return null;
      const share = Number(block - fromBlock) / span;
      return new Date((Number(from.timestamp) + share * (Number(to.timestamp) - Number(from.timestamp))) * 1000).toISOString();
    };
  } catch {
    return () => null;
  }
}

async function storeLogs(source: typeof sources[number], logsByType: Array<{ type: string; logs: unknown[] }>, fromBlock: bigint, toBlock: bigint, client?: PublicClient) {
  if (!logsByType.some(({ logs }) => logs.length)) return;
  const timeOf = await blockTimer(source, fromBlock, toBlock, client);
  for (const { type, logs } of logsByType) {
    for (const log of logs as Log[]) {
      const payload = jsonSafe({ event: type, address: log.address, args: "args" in log ? log.args : undefined, topics: log.topics, data: log.data, blockNumber: log.blockNumber, transactionHash: log.transactionHash, logIndex: log.logIndex });
      const id = `${source.chain}:${log.transactionHash}:${log.logIndex}`;
      await db.query(
        `INSERT INTO chain_events (event_id, chain, event_type, payload, block_number, block_hash, transaction_hash, log_index, occurred_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
         ON CONFLICT (event_id) DO UPDATE SET occurred_at = coalesce(chain_events.occurred_at, EXCLUDED.occurred_at)`,
        [id, source.chain, type, JSON.stringify(payload), log.blockNumber?.toString(), log.blockHash, log.transactionHash, log.logIndex, timeOf(log.blockNumber)]
      );
    }
  }
}

// Historical backfill: walk backwards from where live indexing began to the factory's deployment
// block, one chunk per poll, so creator history and graduations cover every launch ever made.
// Only Pons on Robinhood Chain is backfilled; Clanker on Base launches far too many tokens to store.
const backfillSources = new Set(["pons-v2-rhc", "orbit-launchpad-spcx"]);
const backfillChunk = new Map<string, bigint>();
// The live indexer's RPC provider caps eth_getLogs at about 100 blocks, which would take weeks to
// walk back through history. The backfill uses its own RPC (Robinhood Chain's public endpoint by
// default, overridable with BACKFILL_RPC_URL_RHC) and falls back to the main client if that fails.
const backfillRpcDefaults: Partial<Record<SlipwayChainId, string>> = { rhc: "https://rpc.mainnet.chain.robinhood.com" };
const backfillClients = new Map<SlipwayChainId, PublicClient>();
function backfillClient(chain: SlipwayChainId): PublicClient {
  const url = process.env[`BACKFILL_RPC_URL_${chain.toUpperCase()}`]?.trim() || backfillRpcDefaults[chain];
  if (!url) return getPublicClient(getChainConfig(chain)!);
  const cached = backfillClients.get(chain);
  if (cached) return cached;
  const config = getChainConfig(chain)!;
  const client = createPublicClient({
    chain: defineChain({ id: config.chainId, name: config.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [url] } } }),
    transport: http(url, { timeout: 30_000, retryCount: 1 }),
  });
  backfillClients.set(chain, client);
  return client;
}
const backfillUsesFallback = new Set<string>();
const backfillState = new Map<string, { phase: string; lastError?: string; lastRunAt?: string; lastChunk?: string }>();
async function findDeploymentBlock(source: typeof sources[number], head: bigint) {
  const configured = process.env[`BACKFILL_FLOOR_${source.id.replaceAll("-", "_").toUpperCase()}`];
  if (configured && /^\d+$/.test(configured)) return BigInt(configured);
  const client = getPublicClient(getChainConfig(source.chain)!);
  try {
    let lo = 0n, hi = head;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      const code = await client.getCode({ address: source.address, blockNumber: mid });
      if (code && code !== "0x") hi = mid; else lo = mid + 1n;
    }
    return lo;
  } catch {
    return 0n; // No archive state: scan back to genesis instead. Slower, still correct.
  }
}

async function backfillSource(source: typeof sources[number]) {
  if (!backfillSources.has(source.id)) return;
  const state = backfillState.get(source.id) ?? { phase: "starting" };
  backfillState.set(source.id, state);
  state.lastRunAt = new Date().toISOString();
  const key = `${source.id}:backfill`;
  const existing = await db.query<{ last_block: string }>("SELECT last_block FROM chain_event_cursors WHERE source = $1", [key]);
  const floorRow = await db.query<{ last_block: string }>("SELECT last_block FROM chain_event_cursors WHERE source = $1", [`${source.id}:floor`]);
  let floor: bigint;
  if (floorRow.rows[0]) floor = BigInt(floorRow.rows[0].last_block);
  else {
    state.phase = "finding deployment block";
    const client = getPublicClient(getChainConfig(source.chain)!);
    floor = await findDeploymentBlock(source, await client.getBlockNumber());
    await db.query("INSERT INTO chain_event_cursors (source, chain, last_block) VALUES ($1, $2, $3) ON CONFLICT (source) DO NOTHING", [`${source.id}:floor`, source.chain, floor.toString()]);
  }
  let cursor: bigint;
  if (existing.rows[0]) cursor = BigInt(existing.rows[0].last_block);
  else {
    // Start just below the first block live indexing covered for this factory.
    const live = await db.query<{ first: string | null }>(
      "SELECT min(block_number)::text AS first FROM chain_events WHERE chain = $1 AND lower(payload->>'address') = $2",
      [source.chain, source.address.toLowerCase()],
    );
    const forward = await db.query<{ last_block: string }>("SELECT last_block FROM chain_event_cursors WHERE source = $1", [source.id]);
    const start = live.rows[0]?.first ? BigInt(live.rows[0].first) : forward.rows[0] ? BigInt(forward.rows[0].last_block) : null;
    if (start == null) { state.phase = "waiting for live indexing"; return }
    cursor = start - 1n;
    await db.query("INSERT INTO chain_event_cursors (source, chain, last_block) VALUES ($1, $2, $3) ON CONFLICT (source) DO NOTHING", [key, source.chain, cursor.toString()]);
  }
  if (cursor < floor) { state.phase = "complete"; return }
  state.phase = "scanning";
  const size = backfillChunk.get(source.id) ?? 50_000n;
  const fromBlock = cursor - size + 1n > floor ? cursor - size + 1n : floor;
  const client = backfillUsesFallback.has(source.id) ? getPublicClient(getChainConfig(source.chain)!) : backfillClient(source.chain);
  let logsByType;
  try {
    logsByType = await Promise.all(source.events.map(async ({ event, type }) => ({
      type,
      logs: await client.getLogs({ address: source.address, event, fromBlock, toBlock: cursor }) as unknown[],
    })));
  } catch (error) {
    // If the dedicated backfill RPC is unreachable or refuses even small ranges, use the main client.
    if (!backfillUsesFallback.has(source.id) && size <= 1_000n) { backfillUsesFallback.add(source.id); backfillChunk.set(source.id, 100n); state.lastError = `backfill RPC unavailable; using main RPC: ${errorSummary(error).message}`; return }
    if (isLogRangeLimitError(error) && size > 100n) { backfillChunk.set(source.id, size / 2n); state.lastError = `range too large at ${size} blocks; halving`; return }
    // Unknown errors (timeouts, result limits) also shrink the chunk, so one bad range cannot stall the backfill forever.
    if (size > 100n) backfillChunk.set(source.id, size / 2n);
    state.lastError = errorSummary(error).message;
    throw error;
  }
  await storeLogs(source, logsByType, fromBlock, cursor, client);
  await db.query("UPDATE chain_event_cursors SET last_block = $2, updated_at = now() WHERE source = $1", [key, (fromBlock - 1n).toString()]);
  state.lastChunk = `${fromBlock}-${cursor} (${logsByType.reduce((n, l) => n + l.logs.length, 0)} events)`;
  state.lastError = undefined;
}

export async function backfillStatus(chain: SlipwayChainId) {
  const source = sources.find((s) => s.chain === chain && backfillSources.has(s.id));
  if (!source) return { supported: false, complete: false };
  const rows = await db.query<{ source: string; last_block: string }>(
    "SELECT source, last_block FROM chain_event_cursors WHERE source = ANY($1::text[])",
    [[`${source.id}:backfill`, `${source.id}:floor`]],
  );
  const value = (suffix: string) => rows.rows.find((row) => row.source === `${source.id}:${suffix}`)?.last_block;
  const cursor = value("backfill"), floor = value("floor");
  const state = backfillState.get(source.id);
  return {
    supported: true,
    complete: cursor != null && floor != null && BigInt(cursor) < BigInt(floor),
    cursor: cursor ?? null, floor: floor ?? null,
    chunk: (backfillChunk.get(source.id) ?? 50_000n).toString(),
    rpc: backfillUsesFallback.has(source.id) ? "main" : "backfill",
    phase: state?.phase ?? "not started", lastRunAt: state?.lastRunAt ?? null, lastChunk: state?.lastChunk ?? null, lastError: state?.lastError ?? null,
  };
}

let started = false;
export function startEventIndexer() {
  if (started) return;
  started = true;
  const poll = async () => {
    try {
      for (const source of sources) {
        try {
          await scanSource(source);
        } catch (error) {
          const details = errorSummary(error);
          console.error(JSON.stringify({ event: "event_indexer_error", ...details, source: source.id, chain: source.chain }));
        }
        try {
          await backfillSource(source);
        } catch (error) {
          const details = errorSummary(error);
          const state = backfillState.get(source.id);
          if (state) state.lastError = `${state.phase}: ${details.message}`;
          console.error(JSON.stringify({ event: "event_indexer_error", ...details, source: source.id, chain: source.chain,
            fromBlock: error && typeof error === "object" && "fromBlock" in error ? error.fromBlock : undefined,
            toBlock: error && typeof error === "object" && "toBlock" in error ? error.toBlock : undefined
          }));
        }
      }
      await scanLegacyRouterActivity();
    } finally {
      setTimeout(poll, 3_000).unref?.();
    }
  };
  setTimeout(poll, 1_000).unref?.();
}
