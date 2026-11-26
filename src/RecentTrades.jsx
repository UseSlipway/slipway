import React, { useEffect, useMemo, useState } from 'react';
import { fetchJSON, money } from './MarketBoard';
import { formatTokenAmount } from './api';
import { timeAgo } from './GraduatedFeed';

const explorers = { 'Robinhood Chain': 'https://robinhoodchain.blockscout.com', Base: 'https://basescan.org' };
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';
const sizes = [['Any size', 0], ['$100+', 100], ['$1K+', 1000], ['$10K+', 10000]];
const pageSize = 25;

// GeckoTerminal pool trades → rows from the viewed token's side of the trade.
export function parseTrades(json, token) {
  const self = String(token || '').toLowerCase();
  return (json?.data || []).map(t => {
    const a = t?.attributes || {};
    if (!a.tx_hash || !a.block_timestamp || (a.kind !== 'buy' && a.kind !== 'sell')) return null;
    const isBuy = a.kind === 'buy';
    // Buys move the quote asset into the pool and the token out; sells the reverse.
    const tokenIsTo = a.to_token_address?.toLowerCase() === self;
    const tokenIsFrom = a.from_token_address?.toLowerCase() === self;
    const amount = tokenIsTo ? a.to_token_amount : tokenIsFrom ? a.from_token_amount : isBuy ? a.to_token_amount : a.from_token_amount;
    const price = tokenIsTo ? a.price_to_in_usd : tokenIsFrom ? a.price_from_in_usd : isBuy ? a.price_to_in_usd : a.price_from_in_usd;
    return {
      id: t.id || `${a.tx_hash}:${a.block_number}`,
      side: isBuy ? 'Buy' : 'Sell',
      at: a.block_timestamp,
      usd: Number(a.volume_in_usd),
      amount,
      price: Number(price),
      wallet: a.tx_from_address || '',
      hash: a.tx_hash,
      anomalous: a.is_anomalous === true,
    };
  }).filter(Boolean).sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

export function summarize(rows) {
  const clean = rows.filter(r => !r.anomalous && Number.isFinite(r.usd));
  const buys = clean.filter(r => r.side === 'Buy'), sells = clean.filter(r => r.side === 'Sell');
  const sum = list => list.reduce((total, r) => total + r.usd, 0);
  return { buys: buys.length, sells: sells.length, buyUsd: sum(buys), sellUsd: sum(sells), traders: new Set(clean.map(r => r.wallet.toLowerCase())).size };
}

export default function RecentTrades({ item, endpoint, wallet }) {
  const [state, setState] = useState({ status: 'loading', rows: [] });
  const [side, setSide] = useState('All'), [minUsd, setMinUsd] = useState(0), [mine, setMine] = useState(false), [limit, setLimit] = useState(pageSize);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!item?.pool) return;
    let active = true, controller, retry;
    async function load() {
      clearTimeout(retry);
      controller?.abort();
      controller = new AbortController();
      try {
        const query = minUsd ? `?trade_volume_in_usd_greater_than=${minUsd}` : '';
        const json = await fetchJSON(endpoint, `networks/${encodeURIComponent(item.network)}/pools/${encodeURIComponent(item.pool)}/trades${query}`, controller.signal);
        if (!active) return;
        setState({ status: 'ready', rows: parseTrades(json, item.token), checked: Date.now() });
      } catch (error) {
        if (active && error.name !== 'AbortError') {
          setState(s => ({ ...s, status: s.rows.length ? 'ready' : 'error', stale: true }));
          // A busy provider or a backend restart usually clears quickly; try again sooner than the normal refresh.
          retry = setTimeout(() => { if (active && !document.hidden) load() }, 15000);
        }
      }
    }
    setState({ status: 'loading', rows: [] });
    setLimit(pageSize);
    load();
    const timer = setInterval(() => { if (!document.hidden) load() }, 45000);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => { active = false; controller?.abort(); clearInterval(timer); clearInterval(tick); clearTimeout(retry) };
  }, [item?.network, item?.pool, item?.token, endpoint, minUsd]);

  const me = (wallet || '').toLowerCase();
  const filtered = useMemo(() => state.rows.filter(r => (side === 'All' || r.side === side) && (!mine || (me && r.wallet.toLowerCase() === me))), [state.rows, side, mine, me]);
  const summary = useMemo(() => summarize(state.rows), [state.rows]);
  const explorer = explorers[item?.chain] || explorers['Robinhood Chain'];
  const shown = filtered.slice(0, limit);

  return <section className="recent-trades" aria-labelledby="recent-trades-title">
    <div className="recent-trades-head">
      <div><h2 id="recent-trades-title">Recent trades</h2><p>Last 24 hours on this pool · newest first</p></div>
      <div className="recent-trades-controls">
        <div className="lp-layout" role="group" aria-label="Trade side">{['All', 'Buy', 'Sell'].map(s => <button key={s} type="button" aria-pressed={side === s} onClick={() => { setSide(s); setLimit(pageSize) }}>{s === 'All' ? 'All' : `${s}s`}</button>)}</div>
        <select aria-label="Minimum trade size" value={minUsd} onChange={e => setMinUsd(Number(e.target.value))}>{sizes.map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select>
        {wallet && <button type="button" className={'recent-trades-mine ' + (mine ? 'is-on' : '')} aria-pressed={mine} onClick={() => { setMine(m => !m); setLimit(pageSize) }}>My trades</button>}
      </div>
    </div>
    {state.status === 'ready' && state.rows.length > 0 && <div className="recent-trades-summary" aria-label="24 hour trade summary">
      <span><b className="market-positive">{summary.buys}</b> buys · {money(summary.buyUsd)}</span>
      <span><b className="market-negative">{summary.sells}</b> sells · {money(summary.sellUsd)}</span>
      <span><b>{summary.traders}</b> traders</span>
      {summary.buyUsd + summary.sellUsd > 0 && <span className="recent-trades-ratio" aria-hidden="true"><i style={{ width: `${(summary.buyUsd / (summary.buyUsd + summary.sellUsd)) * 100}%` }} /></span>}
    </div>}
    {state.status === 'loading' ? <div className="market-loading" role="status">Loading recent trades…</div>
      : state.status === 'error' ? <div className="market-empty-state" role="status"><strong>Trades are temporarily unavailable</strong><span>The market provider did not respond. Retrying in a few seconds…</span></div>
        : !filtered.length ? <div className="market-empty-state"><strong>{mine ? 'No trades from your wallet here' : state.rows.length ? 'No trades match these filters' : 'No trades in the last 24 hours'}</strong><span>{mine ? 'Trades you make on this pool show up here, highlighted.' : state.rows.length ? 'Try another side or a smaller minimum size.' : minUsd ? 'Try a smaller minimum size.' : 'This pool has been quiet. New trades appear here within about a minute.'}</span></div>
          : <>
            <div className="recent-trades-table" role="table" aria-label="Recent trades">
              <div className="recent-trades-row is-head" role="row"><span role="columnheader">Time</span><span role="columnheader">Type</span><span role="columnheader">Value</span><span role="columnheader">{item.symbol}</span><span role="columnheader">Price</span><span role="columnheader">Wallet</span></div>
              {shown.map(r => {
                const isMine = me && r.wallet.toLowerCase() === me;
                return <div key={r.id} role="row" className={'recent-trades-row ' + (isMine ? 'is-mine' : '') + (r.anomalous ? ' is-anomalous' : '')}>
                  <span role="cell"><a href={`${explorer}/tx/${r.hash}`} target="_blank" rel="noreferrer" title={new Date(r.at).toLocaleString()}>{timeAgo(r.at, now)} ↗</a></span>
                  <span role="cell" className={r.side === 'Buy' ? 'market-positive' : 'market-negative'}>{r.side}</span>
                  <span role="cell">{money(r.usd)}{r.anomalous && <small title="The market provider flagged this trade as anomalous; it is left out of the summary."> · flagged</small>}</span>
                  <span role="cell">{formatTokenAmount(r.amount, 4)}</span>
                  <span role="cell">{money(r.price)}</span>
                  <span role="cell">{isMine ? <b className="recent-trades-you">You</b> : <a href={`${explorer}/address/${r.wallet}`} target="_blank" rel="noreferrer">{short(r.wallet)}</a>}</span>
                </div>;
              })}
            </div>
            {filtered.length > limit && <button type="button" className="recent-trades-more" onClick={() => setLimit(l => l + pageSize)}>Show more <span>({shown.length} of {filtered.length})</span></button>}
          </>}
    <p className="market-source">Trades from GeckoTerminal, refreshed every 45 seconds{state.checked ? `, checked ${new Date(state.checked).toLocaleTimeString()}` : ''}{state.stale ? ' · last refresh failed, showing earlier data' : ''}. Up to 300 trades from the last 24 hours. Flagged trades are excluded from the summary.</p>
  </section>;
}
