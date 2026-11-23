import { getAddress, parseAbiItem, type Address, type Log } from "viem";
import { getChainConfig, getPublicClient, type SlipwayChainId } from "../chains/config";
import { db } from "../db/index";
import { scanLegacyRouterActivity } from "./legacyRouterMonitor";

const ponsFactory = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e" as Address;
const clankerV4Factory = "0xe85a59c628f7d27878aceb4bf3b35733630083a9" as Address;
const ponsLaunch = parseAbiItem("event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)");
const ponsGraduation = parseAbiItem("event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)");
const clankerLaunch = parseAbiItem("event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)");
const v4Initialize = parseAbiItem("event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)");
const maxLogRange = 100n;
const sources: Array<{ id: string; chain: SlipwayChainId; address: Address; events: Array<{ event: typeof ponsLaunch | typeof ponsGraduation | typeof clankerLaunch | typeof v4Initialize; type: string }> }> = [
  { id: "pons-v2-rhc", chain: "rhc", address: ponsFactory, events: [{ event: ponsLaunch, type: "token.launched" }, { event: ponsGraduation, type: "pool.graduated" }] },
  { id: "clanker-v4-base", chain: "base", address: clankerV4Factory, events: [{ event: clankerLaunch, type: "token.launched" }] },
  { id: "uniswap-v4-pools-base", chain: "base", address: getAddress("0x498581ff718922c3f8e6a244956af099b2652b2b"), events: [{ event: v4Initialize, type: "pool.initialized" }] },
  { id: "uniswap-v4-pools-rhc", chain: "rhc", address: getAddress("0x8366a39cc670b4001a1121b8f6a443a643e40951"), events: [{ event: v4Initialize, type: "pool.initialized" }] },
];

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, child) => typeof child === "bigint" ? child.toString() : child));
}

function errorSummary(error: unknown) {
  const value = error instanceof Error ? error : new Error(String(error));
  const cause = value.cause instanceof Error ? value.cause : undefined;
  const urls = [process.env.RHC_RPC_URL, process.env.BASE_RPC_URL].filter((url): url is string => Boolean(url));
  const redact = (message: string) => urls.reduce((clean, url) => clean.replaceAll(url, "[RPC_URL]"), message).replace(/https?:\/\/\S+/g, "[RPC_URL]").slice(0, 300);
  return {
    errorType: value.name,
    message: redact((value as Error & { shortMessage?: string }).shortMessage ?? value.message),
    causeType: cause?.name,
    causeMessage: cause ? redact((cause as Error & { shortMessage?: string }).shortMessage ?? cause.message) : undefined,
    rpcCode: (value as Error & { code?: number | string }).code
  };
}

async function getLogsWithRangeFallback(source: typeof sources[number], event: typeof ponsLaunch | typeof ponsGraduation | typeof clankerLaunch | typeof v4Initialize, fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
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
  for (const { type, logs } of logsByType) {
    for (const log of logs as Log[]) {
      const payload = jsonSafe({ event: type, address: log.address, args: "args" in log ? log.args : undefined, topics: log.topics, data: log.data, blockNumber: log.blockNumber, transactionHash: log.transactionHash, logIndex: log.logIndex });
      const id = `${source.chain}:${log.transactionHash}:${log.logIndex}`;
      await db.query(
        `INSERT INTO chain_events (event_id, chain, event_type, payload, block_number, block_hash, transaction_hash, log_index)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) ON CONFLICT (event_id) DO NOTHING`,
        [id, source.chain, type, JSON.stringify(payload), log.blockNumber?.toString(), log.blockHash, log.transactionHash, log.logIndex]
      );
    }
  }
  await db.query("UPDATE chain_event_cursors SET last_block = $2, updated_at = now() WHERE source = $1", [source.id, toBlock.toString()]);
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
