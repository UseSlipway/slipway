import React, { useEffect, useRef, useState } from 'react';
import { getEvents, getPoolTrades, marketRequest, resolveToken } from './api';

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const zero = '0x0000000000000000000000000000000000000000';
const short = value => typeof value === 'string' ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Unknown';
const explorer = chain => chain === 'base' ? 'https://basescan.org' : 'https://robinhoodchain.blockscout.com';
const imageUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '' } catch { return '' } };
const timeAgo = (iso, now) => { const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000)); if (!Number.isFinite(seconds)) return ''; if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`; if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`; return `${Math.round(seconds / 86400)}d ago` };
function TokenIcon({item}) { return <span className="market-icon">{item.image&&<img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none'}}/>}<span>{(item.symbol||'?').slice(0,2)}</span></span> }
function poolsForTokens(json) {
  const pools = json?.included || [];
  return new Map((json?.data || []).flatMap(token => {
    const address = token.attributes?.address?.toLowerCase();
    const topIds = new Set((token.relationships?.top_pools?.data || []).map(pool => pool.id));
    const pool = pools.find(candidate => candidate.type === 'pool' && topIds.has(candidate.id) && candidate.relationships?.base_token?.data?.id === token.id);
    return address && pool?.attributes?.address ? [[address, { pool: pool.attributes.address }]] : [];
  }));
}

export function launchesFromEvents(events) {
  const seen = new Set();
  return (events || []).flatMap(event => {
    if (event?.type !== 'token.launched' || !['rhc', 'base'].includes(event.chain)) return [];
    const args = event.payload?.args || {};
    const token = args.token || args.tokenAddress;
    if (typeof token !== 'string' || !addressPattern.test(token) || seen.has(`${event.chain}:${token.toLowerCase()}`)) return [];
    seen.add(`${event.chain}:${token.toLowerCase()}`);
    const isPons = event.chain === 'rhc';
    const pairAddress = args.pairToken || args.pairedToken;
    const pair = !pairAddress || pairAddress.toLowerCase() === zero ? 'ETH'
      : pairAddress.toLowerCase() === '0x4200000000000000000000000000000000000006' ? 'WETH'
        : pairAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? 'USDC'
          : pairAddress.toLowerCase() === '0x0bd7d308f8e1639fab988df18a8011f41eacad73' ? 'WETH'
            : pairAddress.toLowerCase() === '0x5fc5360d0400a0fd4f2af552add042d716f1d168' ? 'USDG' : 'Token';
    return [{
      id: `${event.chain}:${token.toLowerCase()}`, token, chain: isPons ? 'Robinhood Chain' : 'Base',
      network: isPons ? 'robinhood' : 'base', venue: isPons ? 'Pons' : 'Clanker', pair,
      name: args.tokenName || args.name || short(token), symbol: args.tokenSymbol || args.symbol || 'TOKEN',
      image: imageUrl(args.tokenImage || ''), creator: args.deployer || args.msgSender || args.tokenAdmin || '',
      indexedAt: event.indexedAt, transactionHash: event.transactionHash, blockNumber: event.blockNumber,
      pool: null, trades: []
    }];
  }).sort((a, b) => Date.parse(b.indexedAt || 0) - Date.parse(a.indexedAt || 0));
}

function tradeView(trade) {
  const a = trade.attributes || {};
  return {
    kind: a.kind === 'buy' ? 'Buy' : a.kind === 'sell' ? 'Sell' : 'Trade',
    wallet: a.tx_from_address,
    amount: a.to_token_amount,
    usd: Number.isFinite(Number(a.volume_in_usd)) ? Number(a.volume_in_usd) : null,
    at: a.block_timestamp,
    hash: a.tx_hash
  };
}

export default function NewLaunchFeed({ endpoint, onOpenTrade, showHeading = true }) {
  const [state, setState] = useState({ status: 'loading', items: [] });
  const [now, setNow] = useState(Date.now());
  const [enrichTick, setEnrichTick] = useState(0);
  const didInitialEnrich = useRef(false);
  const eventsRef = useRef([]);
  const enrichRef = useRef(0);
  useEffect(() => { eventsRef.current = state.items }, [state.items]);

  useEffect(() => {
    let active = true;
    let controller;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      try {
        const [rhc, base] = await Promise.all([
          getEvents(endpoint, { chain: 'rhc', types: ['token.launched'], order: 'desc', limit: 24 }),
          getEvents(endpoint, { chain: 'base', types: ['token.launched'], order: 'desc', limit: 24 })
        ]);
        if (!active) return;
        const previous = new Map(eventsRef.current.map(item => [item.id, item]));
        const rows = launchesFromEvents([...(rhc.events || []), ...(base.events || [])]).slice(0, 24).map(item => ({ ...item, ...previous.get(item.id) }));
        setState({ status: rows.length ? 'ready' : 'empty', items: rows, checked: Date.now() });
        if (rows.length && !didInitialEnrich.current) { didInitialEnrich.current = true; setEnrichTick(value => value + 1) }
      } catch (error) {
        if (active && error.name !== 'AbortError') setState(current => ({ ...current, status: current.items.length ? 'ready' : 'error', stale: true }));
      }
    }
    load();
    const timer = setInterval(() => { if (!document.hidden) load() }, 5_000);
    const ticker = setInterval(() => setNow(Date.now()), 15_000);
    return () => { active = false; controller?.abort(); clearInterval(timer); clearInterval(ticker) };
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    async function enrich() {
      const rows = eventsRef.current.slice(0, 24);
      if (!rows.length) return;
      const seq = ++enrichRef.current;
      const pons = rows.filter(row => row.venue === 'Pons');
      const base = rows.filter(row => row.network === 'base');
      const [ponsMetadata, basePools] = await Promise.all([
        Promise.all(pons.map(async row => {
          try { const resolved = await resolveToken(endpoint, 'Robinhood Chain', row.token); return [row.id, resolved] }
          catch { return [row.id, null] }
        })),
        base.length ? marketRequest(endpoint, `networks/base/tokens/multi/${base.map(row => row.token).join(',')}?include=top_pools`).then(poolsForTokens).catch(() => new Map()) : Promise.resolve(new Map())
      ]);
      if (!active || seq !== enrichRef.current) return;
      const routes = new Map(ponsMetadata);
      const next = rows.map(row => {
        const route = routes.get(row.id);
        const market = basePools.get(row.token.toLowerCase());
        return {
          ...row,
          name: row.name === short(row.token) ? route?.name || row.name : row.name,
          symbol: row.symbol === 'TOKEN' ? route?.symbol || row.symbol : row.symbol,
          pair: row.pair === 'Token' ? route?.quoteAsset || row.pair : row.pair,
          pool: market?.pool || null
        };
      });
      // Keep GeckoTerminal traffic bounded: at most two fresh Base pools are queried per refresh.
      const tradeRows = next.filter(row => row.pool).slice(0, 2);
      const trades = await Promise.all(tradeRows.map(async row => {
        try {
          const json = await getPoolTrades(endpoint, row.network, row.pool);
          return [row.id, (json.data || []).slice(0, 3).map(tradeView)];
        } catch { return [row.id, []] }
      }));
      if (!active || seq !== enrichRef.current) return;
      const tradeMap = new Map(trades);
      const latest = next.map(row => ({ ...row, trades: tradeMap.get(row.id) || [] }));
      eventsRef.current = latest;
      setState(current => ({ ...current, items: latest, enrichedAt: Date.now() }));
    }
    enrich();
    const timer = setInterval(() => { if (!document.hidden) enrich() }, 30_000);
    return () => { active = false; clearInterval(timer) };
  }, [endpoint, enrichTick]);

  return <section className="new-launch-feed" aria-labelledby="new-launch-title">
    {showHeading && <div className="lp-section-head"><div><h2 id="new-launch-title">New launches</h2><p>Pons · Robinhood Chain and Clanker · Base</p></div></div>}
    {state.status === 'loading' ? <div className="market-loading" role="status">Loading recent launches…</div>
      : state.status === 'error' ? <div className="market-empty-state" role="status"><strong>New launches are temporarily unavailable</strong><span>The indexed event feed did not respond. It retries every few seconds.</span></div>
        : state.status === 'empty' ? <div className="market-empty-state"><strong>No recent launches found</strong><span>New Pons and Clanker launches will appear here as the indexer records them.</span></div>
          : <div className="market-carousel new-launch-list" aria-label="Recent token launches">
            {state.items.map(item => {
              const age = item.indexedAt ? timeAgo(item.indexedAt, now) : '';
              const token = { ...item, chain: item.chain };
              return <article className="new-launch-card" key={item.id}>
                <button className="new-launch-open" type="button" onClick={() => onOpenTrade?.(token)} title={`Trade ${item.name}`}>
                  <span className="new-launch-card-head"><TokenIcon item={item}/><span><b>{item.name}</b><small>${item.symbol}</small></span></span>
                  <span className="new-launch-meta"><span>{item.venue}</span><span>{item.chain}</span><span>{age || 'Recently indexed'}</span></span>
                  <span className="new-launch-pair">Pair · {item.pair}</span>
                </button>
                <span className="new-launch-creator">Creator <a href={`${explorer(item.network === 'base' ? 'base' : 'rhc')}/address/${item.creator || item.token}`} target="_blank" rel="noreferrer">{short(item.creator)}</a></span>
                {item.trades.length > 0 && <span className="new-launch-trades" aria-label="Recent trades">{item.trades.map((trade, index) => <a href={`${explorer(item.network)}/tx/${trade.hash}`} target="_blank" rel="noreferrer" key={`${trade.hash}-${index}`}><b>{trade.kind}</b> {trade.usd == null ? '' : `$${trade.usd.toFixed(2)}`} · {short(trade.wallet)}</a>)}</span>}
                {item.pool && item.trades.length === 0 && <span className="new-launch-trades-empty">No recent trades reported yet</span>}
              </article>;
            })}
          </div>}
    {state.status === 'ready' && <p className="market-source">Launches from Slipway’s indexed onchain events · checked {new Date(state.checked || Date.now()).toLocaleTimeString()}{state.stale ? ' · refresh unavailable, showing earlier results' : ''}. Trade activity appears when GeckoTerminal reports a pool.</p>}
  </section>;
}
