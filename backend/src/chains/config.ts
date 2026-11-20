import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";

export type SlipwayChainId = "rhc" | "base";

export interface ChainConfig {
  id: SlipwayChainId;
  name: string;
  chainId: number;
  rpcEnv: "RHC_RPC_URL" | "BASE_RPC_URL";
  wrappedNative: Address;
  quoteAssets: Array<{ symbol: string; address: Address; decimals: number }>;
  uniswapV3: {
    factory: Address;
    quoter: Address;
    swapRouter: Address;
    universalRouter: Address;
    permit2: Address;
  };
  uniswapV4: {
    poolManager: Address;
    quoter: Address;
    stateView?: Address;
    universalRouter: Address;
  };
  feeRouterEnv: "SLIPWAY_RHC_FEE_ROUTER_ADDRESS" | "SLIPWAY_BASE_FEE_ROUTER_ADDRESS";
  feeRouterV2Env: "SLIPWAY_RHC_FEE_ROUTER_V2_ADDRESS" | "SLIPWAY_BASE_FEE_ROUTER_V2_ADDRESS";
}

const permit2 = "0x000000000022d473030f116ddee9f6b43ac78ba3" as Address;
const configs: Record<SlipwayChainId, ChainConfig> = {
  rhc: {
    id: "rhc",
    name: "Robinhood Chain",
    chainId: 4663,
    rpcEnv: "RHC_RPC_URL",
    wrappedNative: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    quoteAssets: [
      { symbol: "WETH", address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", decimals: 18 },
      { symbol: "USDG", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", decimals: 6 }
    ],
    uniswapV3: {
      factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
      quoter: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
      swapRouter: "0xcaf681a66d020601342297493863e78c959e5cb2",
      universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
      permit2
    },
    uniswapV4: {
      poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
      quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
      universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904"
    },
    feeRouterEnv: "SLIPWAY_RHC_FEE_ROUTER_ADDRESS",
    feeRouterV2Env: "SLIPWAY_RHC_FEE_ROUTER_V2_ADDRESS"
  },
  base: {
    id: "base",
    name: "Base",
    chainId: 8453,
    rpcEnv: "BASE_RPC_URL",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    quoteAssets: [
      { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
      { symbol: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 }
    ],
    uniswapV3: {
      factory: "0x33128a8fc17869897dce68ed026d694621f6fdfd",
      quoter: "0x3d4e44eb1374240ce5f1b871ab261cd16335b76a",
      swapRouter: "0x2626664c2603336e57b271c5c0b26f421741e481",
      universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
      permit2
    },
    uniswapV4: {
      poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
      quoter: "0xe1a6c5803e3c44368b171bd680c7d32dfc92ca47",
      stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
      universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43"
    },
    feeRouterEnv: "SLIPWAY_BASE_FEE_ROUTER_ADDRESS",
    feeRouterV2Env: "SLIPWAY_BASE_FEE_ROUTER_V2_ADDRESS"
  }
};

const clients = new Map<SlipwayChainId, PublicClient>();

export function getChainConfig(id: string): ChainConfig | undefined {
  return Object.hasOwn(configs, id) ? configs[id as SlipwayChainId] : undefined;
}

export function publicChainConfig(config: ChainConfig) {
  return {
    id: config.id,
    name: config.name,
    chainId: config.chainId,
    quoteAssets: config.quoteAssets,
    protocols: {
      uniswapV3: config.uniswapV3,
      uniswapV4: config.uniswapV4,
      slipwayFeeRouter: process.env[config.feeRouterEnv] || undefined,
      slipwayFeeRouterV2: process.env[config.feeRouterV2Env] || undefined
    }
  };
}

export function getPublicClient(config: ChainConfig): PublicClient {
  const cached = clients.get(config.id);
  if (cached) return cached;
  const rpcUrl = process.env[config.rpcEnv]?.trim();
  if (!rpcUrl) throw new Error(`${config.rpcEnv} is not configured`);
  const chain = defineChain({
    id: config.chainId,
    name: config.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  });
  const client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 12_000, retryCount: 1 }) });
  clients.set(config.id, client);
  return client;
}

export const v3FactoryAbi = [{
  type: "function", name: "getPool", stateMutability: "view", inputs: [
    { name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "fee", type: "uint24" }
  ], outputs: [{ name: "pool", type: "address" }]
}] as const;

export const v3PoolAbi = [
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }
] as const;

export const v3PoolFeeAbi = [{
  type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }]
}] as const;

export const erc20ReadAbi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }
] as const;

export const UNISWAP_V3_FEES = [100, 500, 3000, 10000] as const;
