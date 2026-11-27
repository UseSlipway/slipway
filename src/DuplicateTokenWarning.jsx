import React, { useEffect, useState } from 'react';
import { getTokenDuplicates } from './api';

const chains = { rhc: 'Robinhood Chain', base: 'Base', spcx: 'SPCX Chain' };
const explorer = { rhc: 'robinhood', base: 'base' };
const usd = value => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(value);

function poolUrl(item) {
  return item.pool && explorer[item.chain] ? `https://www.geckoterminal.com/${explorer[item.chain]}/pools/${encodeURIComponent(item.pool)}` : null;
}

export default function DuplicateTokenWarning({ item, endpoint }) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    getTokenDuplicates(endpoint, item).then(data => { if (active) setState({ status: 'ready', data }) })
      .catch(error => { if (active) setState({ status: 'error', message: error.message }) });
    return () => { active = false };
  }, [endpoint, item.chain, item.token, item.symbol, item.name, item.cap, item.created]);

  if (state.status === 'loading') return <p className="duplicate-check-status" role="status">Checking for matching names and tickers…</p>;
  if (state.status === 'error') return <p className="duplicate-check-status" role="status">Duplicate check unavailable. {state.message}</p>;
  const { data } = state;
  const complete = data.sourceAvailability?.indexedLaunches === 'available' && data.sourceAvailability?.marketSearches === data.sourceAvailability?.marketSearchesExpected;
  if (!data.matches && complete) return <p className="duplicate-check-status" role="status">No matches found in the indexed metadata and market pools checked. Some launch events omit names or tickers, so this check may not include every token.</p>;
  if (!data.matches) return <p className="duplicate-check-status" role="status">No matches found, but some launch or market data sources were unavailable. Some launch events also omit names or tickers.</p>;

  const original = data.earlierLargerPool;
  const url = original && poolUrl(original);
  return <section className="duplicate-token-warning" aria-labelledby="duplicate-warning-title">
    <div className="duplicate-warning-top"><span aria-hidden="true">!</span><div><h3 id="duplicate-warning-title">Name or ticker overlap</h3><p>Slipway found {data.matches} other matching token{data.matches === 1 ? '' : 's'} across indexed launches and market pools.</p></div></div>
    {original && <p className="duplicate-original">An earlier pool has a larger reported market cap: <strong>{original.name || original.symbol}</strong> · {chains[original.chain] || original.chain} · {usd(original.marketCap)} {url && <a href={url} target="_blank" rel="noreferrer">View pool ↗</a>}</p>}
    {!original && <p className="duplicate-original">No earlier pool with a larger reported market cap was confirmed from the available data.</p>}
    <p className="duplicate-warning-note">Matching names and tickers do not prove tokens are related. Market and launch records may be incomplete.</p>
  </section>;
}
