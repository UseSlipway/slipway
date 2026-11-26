import React, { useEffect, useState } from 'react';
import { getEvents, resolveToken } from './api';
import { fetchJSON, money, unpack, TokenIcon } from './MarketBoard';

const explorer = 'https://robinhoodchain.blockscout.com';
const short = value => `${value.slice(0, 6)}…${value.slice(-4)}`;

export function timeAgo(iso, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Newest Pons graduations first, one card per token.
export function graduationsFromEvents(events) {
  const seen = new Set();
  const rows = [];
  for (const event of events || []) {
    if (event?.type !== 'pool.graduated' || event.chain !== 'rhc') continue;
    const token = event.payload?.args?.token;
    if (typeof token !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(token)) continue;
    const id = token.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ token, at: event.indexedAt, transactionHash: event.transactionHash });
  }
  return rows;
}

// Pick each token's pool from a GeckoTerminal tokens/multi?include=top_pools response, in Slipway's market row shape.
export function poolsForTokens(json, network = 'robinhood') {
  const tokens = json?.data || [];
  const pools = (json?.included || []).filter(x => x.type === 'pool');
  const byToken = new Map();
  for (const token of tokens) {
    const address = token.attributes?.address?.toLowerCase();
    if (!address) continue;
    const topIds = new Set((token.relationships?.top_pools?.data || []).map(p => p.id));
    const pool = pools.find(p => topIds.has(p.id) && p.relationships?.base_token?.data?.id === token.id);
    if (!pool) { byToken.set(address, { meta: token.attributes }); continue; }
    const row = unpack({ data: [pool], included: tokens }, network)[0];
    if (row) byToken.set(address, { row: { ...row, venue: pool.relationships?.dex?.data?.id || row.venue }, meta: token.attributes });
  }
  return byToken;
}

export default function GraduatedFeed({ endpoint, onSelect, onGraduated }) {
  const [state, setState] = useState({ status: 'loading', items: [] });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true, controller;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      try {
        const feed = await getEvents(endpoint, { chain: 'rhc', types: ['pool.graduated'], order: 'desc', limit: 24 });
        const graduations = graduationsFromEvents(feed.events).slice(0, 12);
        let markets = new Map();
        if (graduations.length) {
          try {
            const json = await fetchJSON(endpoint, `networks/robinhood/tokens/multi/${graduations.map(g => g.token).join(',')}?include=top_pools`, controller.signal);
            markets = poolsForTokens(json);
          } catch (error) { if (error.name === 'AbortError') return }
        }
        if (!active) return;
        let items = graduations.map(g => ({ ...g, ...markets.get(g.token.toLowerCase()) }));
        // Without market data, still name the token from Slipway's own resolver.
        items = await Promise.all(items.map(async item => item.row || item.meta?.name ? item
          : { ...item, meta: await resolveToken(endpoint, 'Robinhood Chain', item.token).then(r => ({ name: r.name, symbol: r.symbol })).catch(() => null) }));
        if (!active) return;
        setState({ status: items.length ? 'ready' : 'empty', items, checked: Date.now(), partial: graduations.length > 0 && markets.size === 0 });
        onGraduated?.(new Set(graduations.map(g => g.token.toLowerCase())));
      } catch (error) {
        if (active && error.name !== 'AbortError') setState(s => ({ ...s, status: s.items.length ? 'ready' : 'error', stale: true }));
      }
    }
    load();
    const timer = setInterval(() => { if (!document.hidden) load() }, 60000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => { active = false; controller?.abort(); clearInterval(timer); clearInterval(tick) };
  }, [endpoint]);

  return <section className="graduated-feed" aria-labelledby="graduated-title">
    <div className="lp-section-head">
      <div>
        <h2 id="graduated-title">Just graduated</h2>
        <p>Pons tokens whose bonding curve filled and moved into a Uniswap pool · Robinhood Chain</p>
      </div>
    </div>
    {state.status === 'loading' ? <div className="market-loading" role="status">Checking recent graduations…</div>
      : state.status === 'error' ? <div className="market-empty-state" role="status"><strong>Graduations are temporarily unavailable</strong><span>The event feed did not respond. This retries every minute.</span></div>
        : state.status === 'empty' ? <div className="market-empty-state graduated-empty"><strong>No graduations yet</strong><span>Tokens appear here the moment their Pons curve fills and liquidity moves to Uniswap. Most launches never graduate.</span></div>
          : <div className="market-carousel graduated-list" aria-label="Recently graduated tokens">
            {state.items.map(item => {
              const name = item.row?.name || item.meta?.name || short(item.token);
              const symbol = item.row?.symbol || item.meta?.symbol || '';
              const when = item.at ? timeAgo(item.at, now) : '';
              const body = <>
                <span className="market-trend-image"><TokenIcon item={item.row || { symbol, image: /^https:\/\//.test(item.meta?.image_url || '') ? item.meta.image_url : '' }} /></span>
                <span className="market-trend-name">{name}{symbol && <small> ${symbol}</small>}</span>
                <span className="graduated-chip">Graduated{when && ` · ${when}`}</span>
                {item.row ? <span><b>{money(item.row.fdv ?? item.row.cap)}</b> <small className="market-tiny">FDV · {money(item.row.volume)} 24h vol</small></span>
                  : <small className="market-tiny">Pool data not available yet</small>}
              </>;
              return item.row
                ? <button key={item.token} className="market-trend graduated-card" onClick={() => onSelect(item.row)} title={item.at ? `Indexed ${new Date(item.at).toLocaleString()}` : undefined}>{body}</button>
                : <a key={item.token} className="market-trend graduated-card" href={`${explorer}/token/${item.token}`} target="_blank" rel="noreferrer">{body}<small className="market-tiny">View on explorer ↗</small></a>;
            })}
          </div>}
    {state.status === 'ready' && <p className="market-source">Graduations from Slipway's onchain indexer{state.checked ? `, checked ${new Date(state.checked).toLocaleTimeString()}` : ''}{state.stale ? ' · last refresh failed, showing earlier data' : ''}{state.partial ? ' · market data unavailable right now' : ''}. Prices from GeckoTerminal.</p>}
  </section>;
}
