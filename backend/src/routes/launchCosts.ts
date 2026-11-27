import { Router } from "express";
import { formatEther, getAddress, parseAbi } from "viem";
import { getChainConfig, getPublicClient } from "../chains/config";

// Live launch economics for the launch cost calculator, read from each launchpad before any quote.
// Pons: launch fee and the first enabled launch config (the one /launch/quote uses) from the factory.
// Orbit: zero launch fee, 1% base fee plus the creator's chosen fee, and the engine's virtual reserve.
// Clanker: no launch fee beyond network gas.
export const launchCostRouter = Router();

const ponsFactory = getAddress("0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e");
const ponsAbi = parseAbi([
  "struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  "function launchFee() view returns (uint256)",
]);
const orbitEngineAbi = parseAbi(["function virtualSPCX() view returns (uint256)"]);
// Pons credits the creator 70% of its curve trade fee (Pons docs: fees; Pons keeps 30%).
const PONS_CREATOR_SHARE_BPS = 7000;
const cache = new Map<string, { at: number; body: unknown }>();

async function ponsCosts() {
  const client = getPublicClient(getChainConfig("rhc")!);
  const [count, fee] = await Promise.all([
    client.readContract({ address: ponsFactory, abi: ponsAbi, functionName: "launchConfigCount" }),
    client.readContract({ address: ponsFactory, abi: ponsAbi, functionName: "launchFee" }),
  ]);
  for (let id = 0n; id < count; id++) {
    const config = await client.readContract({ address: ponsFactory, abi: ponsAbi, functionName: "getLaunchConfig", args: [id] });
    if (!config.enabled) continue;
    return {
      venue: "pons", chain: "rhc", asset: "ETH",
      launchFee: formatEther(fee),
      supply: formatEther(config.supply),
      curveFeeBps: Number(config.curveFeeBps),
      creatorShareBps: PONS_CREATOR_SHARE_BPS,
      graduationThreshold: formatEther(config.graduationThreshold),
      virtualReserve: formatEther(config.phantomQuote),
      creatorBuy: false,
      source: "Pons launch factory (live)",
    };
  }
  throw new Error("No enabled Pons launch configuration");
}

async function orbitCosts() {
  const config = getChainConfig("spcx");
  if (!config?.orbit) throw new Error("Orbit is not configured");
  const client = getPublicClient(config);
  const virtualSPCX = await client.readContract({ address: config.orbit.engine, abi: orbitEngineAbi, functionName: "virtualSPCX" });
  return {
    venue: "orbit", chain: "spcx", asset: "SPCX",
    launchFee: "0",
    supply: "1000000000",
    baseFeeBps: 100,
    maxCreatorFeeBps: 1000,
    virtualReserve: formatEther(virtualSPCX),
    creatorBuy: true,
    source: "Orbit engine (live)",
  };
}

launchCostRouter.get("/launch/costs", async (request, response) => {
  const chain = request.query.chain;
  if (chain !== "rhc" && chain !== "base" && chain !== "spcx") { response.status(400).json({ error: "Provide a supported chain" }); return; }
  const hit = cache.get(chain);
  if (hit && Date.now() - hit.at < 5 * 60_000) { response.setHeader("Cache-Control", "public, max-age=60").json(hit.body); return; }
  try {
    const body = chain === "rhc" ? await ponsCosts()
      : chain === "spcx" ? await orbitCosts()
        : { venue: "clanker-v4", chain: "base", asset: "ETH", launchFee: "0", creatorBuy: false, source: "Clanker v4: no launch fee; network gas only" };
    cache.set(chain, { at: Date.now(), body });
    response.setHeader("Cache-Control", "public, max-age=60").json(body);
  } catch {
    response.status(503).json({ error: "Launch costs are temporarily unavailable" });
  }
});
