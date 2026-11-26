import React, { useEffect, useState } from 'react';
import { getTrending } from './api';
import { fetchJSON, money, TokenIcon } from './MarketBoard';
import { poolsForTokens } from './GraduatedFeed';

const networkOf = { rhc: 'robinhood', base: 'base' };
const chainName = { rhc: 'Robinhood Chain', base: 'Base' };
const chainParam = { 'Robinhood Chain': 'rhc', Base: 'base' };
const short = value => `${value.slice(0, 6)}…${value.slice(-4)}`;

export function activityLine({ quotes, builds, watchers }) {
  const parts = [];
  if (builds) parts.push(`${builds} trade${builds === 1 ? '' : 's'} prepared`);
  if (quotes) parts.push(`${quotes} quote${quotes === 1 ? '' : 's'}`);
  if (watchers) parts.push(`${watchers} watching`);
  return parts.join(' · ');
}

// Rank from Slipway's own activity, then price each token with one tokens/multi lookup per chain.
async function loadTrending(endpoint, chain, signal) {
  const param = chainParam[chain];
  let result = await getTrending(endpoint, { window: '1h', chain: param, limit: 12 });
  let window = '1h';
  if ((result.tokens || []).length < 3) {
    result = await getTrending(endpoint, { window: '24h', chain: param, limit: 12 });
    window = '24h';
  }
  const tokens = (result.tokens || []).filter(t => networkOf[t.chain] && /^0x[a-fA-F0-9]{40}$/.test(t.token));
  const markets = new Map();
  for (const id of [...new Set(tokens.map(t => t.chain))]) {
    const list = tokens.filter(t => t.chain === id).map(t => t.token);
    try {
      const json = await fetchJSON(endpoint, `networks/${networkOf[id]}/tokens/multi/${list.join(',')}?include=top_pools`, signal);
      for (const [address, value] of poolsForTokens(json, networkOf[id])) markets.set(`${id}:${address}`, value);
    } catch (error) { if (error.name === 'AbortError') throw error }
  }
  return { window, items: tokens.map(t => ({ ...t, ...markets.get(`${t.chain}:${t.token.toLowerCase()}`) })) };
}

export default function SlipwayTrending({ endpoint, chain, onSelect }) {
  const [state, setState] = useState({ status: 'loading', items: [] });
  useEffect(() => {
    let active = true, controller;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      try {
        const { window, items } = await loadTrending(endpoint, chain, controller.signal);
        if (active) setState({ status: items.length ? 'ready' : 'empty', items, window, checked: Date.now() });
      } catch (error) {
        if (active && error.name !== 'AbortError') setState(s => ({ ...s, status: s.items.length ? 'ready' : 'error', stale: true }));
      }
    }
    setState(s => ({ ...s, status: s.items.length ? 'ready' : 'loading' }));
    load();
    const timer = setInterval(() => { if (!document.hidden) load() }, 120000);
    return () => { active = false; controller?.abort(); clearInterval(timer) };
  }, [endpoint, chain]);

  // Render nothing until there is something to rank, so an empty feed never flashes a loading state.
  if (state.status !== 'ready' || !state.items.length) return null;
  return <section className="slipway-trending" aria-labelledby="slipway-trending-title">
    <div className="lp-section-head">
      <div>
        <h2 id="slipway-trending-title">Trending on Slipway</h2>
        <p>Ranked by quotes, prepared trades and watchlists on Slipway{state.window ? ` · last ${state.window === '1h' ? 'hour' : '24 hours'}` : ''}</p>
      </div>
    </div>
    <ol className="slipway-trending-list">
        {state.items.map((item, index) => {
          const name = item.row?.name || item.meta?.name || short(item.token);
          const symbol = item.row?.symbol || item.meta?.symbol || '';
          const body = <>
            <span className="slipway-trending-rank">{index + 1}</span>
            <TokenIcon item={item.row || { symbol, image: /^https:\/\//.test(item.meta?.image_url || '') ? item.meta.image_url : '' }} />
            <span className="slipway-trending-name"><b>{name}</b>{symbol && <span> ${symbol}</span>}<small>{chainName[item.chain]} · {activityLine(item)}</small></span>
            <span className="slipway-trending-price">{item.row ? <><b>{money(item.row.fdv ?? item.row.cap)}</b><small>FDV</small></> : <small>No pool data yet</small>}</span>
          </>;
          return <li key={`${item.chain}:${item.token}`}>{item.row
            ? <button type="button" className="slipway-trending-row" onClick={() => onSelect(item.row)}>{body}</button>
            : <div className="slipway-trending-row is-static">{body}</div>}</li>;
        })}
      </ol>
    {<p className="market-source">From anonymous Slipway activity: counts only, no wallets or amounts{state.checked ? ` · checked ${new Date(state.checked).toLocaleTimeString()}` : ''}{state.stale ? ' · last refresh failed, showing earlier data' : ''}. Not a recommendation.</p>}
  </section>;
}
