import type { Address, Log, PublicClient } from "viem";
import { getChainConfig, getPublicClient, type SlipwayChainId } from "../chains/config";
import { db } from "../db/index";

const legacyRouters = [
  "0x56d15a85d9f4ecec16c002dc5a02ef6b94c215c5",
  "0xe7635ad3fda4df9800b63cdcd164669d31a6fdca"
] as const satisfies readonly Address[];
const tradeExecutedTopic = "0xf356327e394eb6b6ba46b7ddfe8fd5db3b24d61a32b9260c971a77dd1ca1dff9";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const maxLogRange = 100n;

type ActivityKind = "legacy_router_trade" | "legacy_router_erc20_outflow";
type LogFilter = {
  fromBlock: `0x${string}`;
  toBlock: `0x${string}`;
  address?: Address[];
  topics: (`0x${string}` | `0x${string}`[] | null)[];
};

function addressTopic(address: Address): `0x${string}` {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

export function legacyRouterFilters(fromBlock: bigint, toBlock: bigint): [LogFilter, LogFilter] {
  const range = { fromBlock: `0x${fromBlock.toString(16)}` as const, toBlock: `0x${toBlock.toString(16)}` as const };
  return [
    { ...range, address: [...legacyRouters], topics: [tradeExecutedTopic] },
    { ...range, topics: [transferTopic, legacyRouters.map(addressTopic)] }
  ];
}

async function logsInRange(client: PublicClient, filter: LogFilter): Promise<Log[]> {
  try {
    return await client.request({ method: "eth_getLogs", params: [filter] } as never) as Log[];
  } catch (error) {
    const fromBlock = BigInt(filter.fromBlock);
    const toBlock = BigInt(filter.toBlock);
    if (fromBlock >= toBlock || !isLogRangeLimitError(error)) throw error;
    const midpoint = fromBlock + (toBlock - fromBlock) / 2n;
    const [left, right] = await Promise.all([
      logsInRange(client, { ...filter, toBlock: `0x${midpoint.toString(16)}` }),
      logsInRange(client, { ...filter, fromBlock: `0x${(midpoint + 1n).toString(16)}` })
    ]);
    return [...left, ...right];
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

async function scanChain(chain: SlipwayChainId): Promise<void> {
  const config = getChainConfig(chain)!;
  if (!config.restrictedFeeRouterAddress) return;
  const client = getPublicClient(config);
  const head = await client.getBlockNumber();
  const safeHead = head > 3n ? head - 3n : head;
  const source = `legacy-router-monitor-${chain}`;
  const existing = await db.query<{ last_block: string }>("SELECT last_block FROM chain_event_cursors WHERE source = $1", [source]);
  let cursor = existing.rows[0] ? BigInt(existing.rows[0].last_block) : safeHead - 1n;
  if (!existing.rows[0]) {
    await db.query(
      "INSERT INTO chain_event_cursors (source, chain, last_block) VALUES ($1, $2, $3) ON CONFLICT (source) DO NOTHING",
      [source, chain, cursor.toString()]
    );
    const raced = await db.query<{ last_block: string }>("SELECT last_block FROM chain_event_cursors WHERE source = $1", [source]);
    cursor = BigInt(raced.rows[0]!.last_block);
  }
  if (cursor >= safeHead) return;

  const fromBlock = cursor + 1n;
  const toBlock = fromBlock + maxLogRange - 1n < safeHead ? fromBlock + maxLogRange - 1n : safeHead;
  const [tradeFilter, transferFilter] = legacyRouterFilters(fromBlock, toBlock);
  const [trades, transfers] = await Promise.all([
    logsInRange(client, tradeFilter),
    logsInRange(client, transferFilter)
  ]);
  await persistAndAlert(chain, "legacy_router_trade", trades);
  await persistAndAlert(chain, "legacy_router_erc20_outflow", transfers);
  await db.query("UPDATE chain_event_cursors SET last_block = $2, updated_at = now() WHERE source = $1", [source, toBlock.toString()]);
}

async function persistAndAlert(chain: SlipwayChainId, kind: ActivityKind, logs: Log[]): Promise<void> {
  for (const log of logs) {
    const payload = {
      kind,
      chain,
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockNumber: log.blockNumber?.toString(),
      transactionHash: log.transactionHash,
      logIndex: log.logIndex
    };
    const eventId = `${chain}:${log.transactionHash}:${log.logIndex}`;
    await db.query(
      `INSERT INTO chain_events (event_id, chain, event_type, payload, block_number, block_hash, transaction_hash, log_index)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) ON CONFLICT (event_id) DO NOTHING`,
      [eventId, chain, kind, JSON.stringify(payload), log.blockNumber?.toString(), log.blockHash, log.transactionHash, log.logIndex]
    );
    const alert = { event: "legacy_router_activity_alert", ...payload };
    console.error(JSON.stringify(alert));
    await notifyWebhook(alert, `Slipway legacy router activity: ${chain} ${kind} at block ${payload.blockNumber}, tx ${payload.transactionHash}`);
  }
}

async function notifyWebhook(alert: Record<string, unknown>, message: string): Promise<void> {
  const webhook = process.env.SECURITY_ALERT_WEBHOOK_URL?.trim();
  if (!webhook) return;
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...alert, text: message, content: message }),
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) console.error(JSON.stringify({ event: "security_alert_webhook_error", status: response.status }));
  } catch (error) {
    console.error(JSON.stringify({ event: "security_alert_webhook_error", errorType: error instanceof Error ? error.name : "Error" }));
  }
}

export async function scanLegacyRouterActivity(): Promise<void> {
  for (const chain of ["rhc", "base"] as const) {
    try {
      await scanChain(chain);
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error));
      const message = value.message.replace(/https?:\/\/\S+/g, "[RPC_URL]").slice(0, 300);
      const alert = { event: "legacy_router_monitor_error", chain, errorType: value.name, message };
      console.error(JSON.stringify(alert));
      await notifyWebhook(alert, `Slipway legacy router monitoring error on ${chain}: ${value.name}`);
    }
  }
}
