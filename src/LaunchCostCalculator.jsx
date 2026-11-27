import React, { useEffect, useState } from 'react';
import { getLaunchCosts } from './api';

const chainId = { 'Robinhood Chain': 'rhc', Base: 'base', 'SPCX Chain': 'spcx' };
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 };
export function fmt(n, digits = 6) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (Math.abs(n) < 0.000001) return n.toExponential(2);
  return n.toLocaleString('en-US', { maximumSignificantDigits: digits });
}

// Pure maths for the calculator, kept separate so it can be tested.
export function ponsEstimate(costs) {
  const fee = num(costs.curveFeeBps) / 10_000, share = num(costs.creatorShareBps) / 10_000, grad = num(costs.graduationThreshold);
  return { feePct: fee * 100, creatorPct: fee * share * 100, graduation: grad, earnedAtGraduation: grad * fee * share, upfront: num(costs.launchFee) };
}

export function orbitEstimate(costs, buy, creatorFeeBps) {
  const amount = Math.max(0, num(buy)), creator = Math.min(Math.max(num(creatorFeeBps), 0), num(costs.maxCreatorFeeBps || 1000));
  const totalFee = (num(costs.baseFeeBps) + creator) / 10_000;
  const net = amount * (1 - totalFee), supply = num(costs.supply), virtual = num(costs.virtualReserve);
  const tokens = net > 0 && virtual > 0 ? (net * supply) / (virtual + net) : 0;
  const startPrice = virtual > 0 && supply > 0 ? virtual / supply : 0;
  const avgPrice = tokens > 0 ? net / tokens : 0;
  return {
    tradeFeePct: totalFee * 100, creatorPct: creator / 100, upfront: num(costs.launchFee) + amount,
    tokens, supplyPct: supply ? (tokens / supply) * 100 : 0,
    priceImpactPct: startPrice > 0 && avgPrice > 0 ? (avgPrice / startPrice - 1) * 100 : 0,
  };
}

export default function LaunchCostCalculator({ endpoint, chain, devBuy, creatorFeeBps }) {
  const id = chainId[chain];
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    if (!id) return;
    let active = true;
    setState({ status: 'loading' });
    getLaunchCosts(endpoint, id).then(costs => { if (active) setState({ status: 'ready', costs }) }).catch(() => { if (active) setState({ status: 'error' }) });
    return () => { active = false };
  }, [endpoint, id]);
  if (!id) return null;
  const costs = state.costs;
  let rows = [], note = null;
  if (state.status === 'ready' && costs.venue === 'pons') {
    const e = ponsEstimate(costs);
    rows = [
      ['Launch fee', `${fmt(e.upfront)} ETH + network gas`, 'Paid when you sign the launch.'],
      ['Curve trading fee', `${fmt(e.feePct, 3)}% per trade`, `You earn ${fmt(e.creatorPct, 3)}% of every curve trade (${fmt(num(costs.creatorShareBps) / 100, 3)}% of the fee).`],
      ['Graduation', `${fmt(e.graduation)} ETH of buys`, 'When the curve fills, liquidity moves to a Uniswap v4 pool.'],
      ['If it graduates', `≈ ${fmt(e.earnedAtGraduation)} ETH or more`, 'Your fee share from curve buys alone; sells and later pool trading add to it.'],
    ];
    note = 'Pons creator buys are not offered through Slipway yet.';
  } else if (state.status === 'ready' && costs.venue === 'orbit') {
    const e = orbitEstimate(costs, devBuy, creatorFeeBps);
    rows = [
      ['Launch fee', '0 SPCX + network gas', 'Orbit charges no launch fee.'],
      ['Trading fee', `${fmt(e.tradeFeePct, 3)}% per trade`, `1% Orbit base fee plus your ${fmt(e.creatorPct, 3)}% creator fee, which you earn on every trade.`],
      ...(num(devBuy) > 0 ? [
        ['Opening buy', `≈ ${fmt(e.tokens, 4)} tokens`, `About ${fmt(e.supplyPct, 3)}% of supply, with roughly ${fmt(e.priceImpactPct, 3)}% price impact.`],
        ['Total to sign', `${fmt(e.upfront)} SPCX + network gas`, 'Launch fee plus your opening buy.'],
      ] : []),
    ];
  } else if (state.status === 'ready') {
    rows = [
      ['Launch fee', 'None, network gas only', 'Clanker charges no launch fee.'],
      ['Trading fees', 'Set by Clanker', 'Your share of trading fees collects in the Clanker fee locker. Claim it from Workspace → Launches.'],
    ];
  }
  return <section className="launch-cost" aria-labelledby="launch-cost-title">
    <div className="launch-cost-head"><h3 id="launch-cost-title">What this launch costs and earns</h3><small>{costs?.source || ''}</small></div>
    {state.status === 'loading' ? <p className="launch-cost-muted" role="status">Reading live launch settings…</p>
      : state.status === 'error' ? <p className="launch-cost-muted" role="status">Live launch costs are unavailable right now. Your quote will still show every fee before you sign.</p>
        : <dl className="launch-cost-rows">{rows.map(([label, value, help]) => <div key={label}><dt>{label}</dt><dd><b>{value}</b><small>{help}</small></dd></div>)}</dl>}
    {note && <p className="launch-cost-muted">{note}</p>}
    <p className="launch-cost-muted">Estimates from live launchpad settings. Your quote shows the exact amounts before you sign.</p>
  </section>;
}
