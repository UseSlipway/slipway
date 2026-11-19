import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { ExactEvmScheme as ExactEvmServerScheme } from "@x402/evm/exact/server";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { x402Facilitator } from "@x402/core/facilitator";
import { x402ResourceServer } from "@x402/core/server";
import type { SupportedResponse } from "@x402/core/types";
import { createPublicClient, createWalletClient, defineChain, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const facilitator = new x402Facilitator();
const resourceServer = new x402ResourceServer({
  getSupported: async () => facilitator.getSupported() as unknown as SupportedResponse,
  verify: (payload, requirements) => facilitator.verify(payload, requirements),
  settle: (payload, requirements) => facilitator.settle(payload, requirements)
});
let configured = false;

export function isX402Enabled(): boolean {
  return process.env.X402_ENABLED === "true";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured when X402_ENABLED=true`);
  return value;
}

function chainId(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

async function registerEvmNetwork(options: {
  name: string;
  chainId: number;
  rpcUrl: string;
  account: ReturnType<typeof privateKeyToAccount>;
}): Promise<void> {
  const chain = defineChain({
    id: options.chainId,
    name: options.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [options.rpcUrl] } }
  });
  const transport = http(options.rpcUrl, { timeout: 15_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account: options.account, chain, transport });
  const actualChainId = await publicClient.getChainId();
  if (actualChainId !== options.chainId) {
    throw new Error(`${options.name} RPC chain ID mismatch: expected ${options.chainId}, received ${actualChainId}`);
  }

  const combinedClient = walletClient.extend(publicActions);
  const signer = toFacilitatorEvmSigner({
    address: options.account.address,
    readContract: combinedClient.readContract,
    verifyTypedData: (args) => combinedClient.verifyTypedData({ ...args, blockTag: "latest" } as never),
    writeContract: combinedClient.writeContract,
    sendTransaction: combinedClient.sendTransaction,
    waitForTransactionReceipt: combinedClient.waitForTransactionReceipt,
    getCode: combinedClient.getCode
  });

  facilitator.register(`eip155:${options.chainId}`, new ExactEvmScheme(signer, { simulateInSettle: true }));
  resourceServer.register(`eip155:${options.chainId}`, new ExactEvmServerScheme());
}

/** Register Slipway's exact-payment facilitator for RHC and Base in-process. */
export async function configureX402Facilitator(): Promise<void> {
  if (!isX402Enabled() || configured) return;

  const rawPrivateKey = required("X402_FACILITATOR_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(rawPrivateKey)) {
    throw new Error("X402_FACILITATOR_PRIVATE_KEY must be a 32-byte 0x-prefixed EVM private key");
  }
  const account = privateKeyToAccount(rawPrivateKey as `0x${string}`);
  for (const [variable, label] of [
    ["X402_RHC_USDG_ADDRESS", "RHC USDG"],
    ["X402_BASE_USDC_ADDRESS", "Base USDC"],
    ["X402_RHC_PAY_TO", "RHC pay-to"],
    ["X402_BASE_PAY_TO", "Base pay-to"]
  ]) {
    const value = required(variable);
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${variable} must be an EVM address (${label})`);
  }

  await registerEvmNetwork({
    name: "Robinhood Chain",
    chainId: chainId("X402_RHC_CHAIN_ID", 4663),
    rpcUrl: required("RHC_RPC_URL"),
    account
  });
  await registerEvmNetwork({
    name: "Base",
    chainId: chainId("X402_BASE_CHAIN_ID", 8453),
    rpcUrl: required("BASE_RPC_URL"),
    account
  });
  configured = true;
  console.info("x402 exact facilitator configured for RHC and Base");
}

export function getX402Facilitator(): x402Facilitator {
  return facilitator;
}

export function getX402ResourceServer(): x402ResourceServer {
  return resourceServer;
}
