import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchJSON, money } from './MarketBoard';
import { parseTrades } from './RecentTrades';

const W = 800, AXIS = 78, H = 330, PRICE_TOP = 22, PRICE_BOTTOM = 228, VOL_TOP = 244, VOL_BOTTOM = 292;
const bucketSeconds = { '1m': 60, '5m': 300, '1h': 3600, '6h': 21600, '1D': 86400, '7D': 86400, All: 86400 };
const fmt = n => !Number.isFinite(n) ? '—' : n < 0.01 ? n.toPrecision(3) : n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 5 : 2 });
const fmtVol = n => !Number.isFinite(n) ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;

// Index of the candle containing a unix time (seconds), or -1 when outside the loaded range.
export function candleIndexAt(rows, seconds, bucket) {
  if (!rows.length || !Number.isFinite(seconds)) return -1;
  if (seconds < rows[0][0] || seconds >= rows.at(-1)[0] + bucket) return -1;
  let lo = 0, hi = rows.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rows[mid][0] <= seconds) lo = mid; else hi = mid - 1 }
  return lo;
}

// Chart markers: graduation and pool creation from market metadata, plus the connected wallet's own trades.
export function buildMarkers({ graduatedAt, poolCreatedAt, trades = [], wallet }) {
  const markers = [];
  const grad = Date.parse(graduatedAt || '');
  const created = Date.parse(poolCreatedAt || '');
  if (Number.isFinite(grad)) markers.push({ kind: 'graduated', label: 'Graduated', at: grad / 1000 });
  if (Number.isFinite(created) && !(Number.isFinite(grad) && Math.abs(created - grad) < 15 * 60 * 1000)) markers.push({ kind: 'pool', label: 'Pool created', at: created / 1000 });
  const me = (wallet || '').toLowerCase();
  if (me) for (const t of trades) if (t.wallet?.toLowerCase() === me) markers.push({ kind: t.side === 'Buy' ? 'buy' : 'sell', label: `You ${t.side === 'Buy' ? 'bought' : 'sold'} ${money(t.usd)}`, at: Date.parse(t.at) / 1000, hash: t.hash });
  return markers;
}

export function useChartMarkers(item, endpoint, wallet) {
  const [meta, setMeta] = useState({ graduatedAt: null, trades: [] });
  useEffect(() => {
    if (!item?.token || !item?.pool) return;
    let active = true;
    const controller = new AbortController();
    setMeta({ graduatedAt: null, trades: [] });
    (async () => {
      const [info, trades] = await Promise.all([
        fetchJSON(endpoint, `networks/${encodeURIComponent(item.network)}/tokens/multi/${item.token}?include=top_pools`, controller.signal).catch(() => null),
        wallet ? fetchJSON(endpoint, `networks/${encodeURIComponent(item.network)}/pools/${encodeURIComponent(item.pool)}/trades`, controller.signal).catch(() => null) : null,
      ]);
      if (!active) return;
      const details = info?.data?.[0]?.attributes?.launchpad_details;
      setMeta({ graduatedAt: details?.completed ? details.completed_at : null, trades: trades ? parseTrades(trades, item.token) : [] });
    })();
    return () => { active = false; controller.abort() };
  }, [item?.network, item?.pool, item?.token, endpoint, wallet]);
  return useMemo(() => buildMarkers({ graduatedAt: meta.graduatedAt, poolCreatedAt: item?.created, trades: meta.trades, wallet }), [meta, item?.created, wallet]);
}

export default function PriceChart({ rows, mode = 'candles', period = '1h', markers = [], showMarkers = true }) {
  const wrap = useRef();
  const [hover, setHover] = useState(null);
  useEffect(() => setHover(null), [rows, period]);
  if (!rows.length) return <div className="market-chart-placeholder">Loading chart…</div>;
  const lo = Math.min(...rows.map(r => r[3])), hi = Math.max(...rows.map(r => r[2]));
  const span = hi - lo || hi * 0.01 || 1;
  const y = v => PRICE_BOTTOM - ((v - lo) / span) * (PRICE_BOTTOM - PRICE_TOP);
  const step = W / rows.length, x = i => (i + 0.5) * step;
  const maxVol = Math.max(...rows.map(r => r[5])) || 1;
  const vy = v => VOL_BOTTOM - (v / maxVol) * (VOL_BOTTOM - VOL_TOP);
  const last = rows.at(-1);
  const bucket = bucketSeconds[period] || 3600;
  const placed = showMarkers ? markers.map(m => ({ ...m, i: candleIndexAt(rows, m.at, bucket) })).filter(m => m.i >= 0) : [];
  const offscreen = showMarkers ? markers.length - placed.length : 0;
  const active = hover != null ? rows[hover] : null;

  function pick(clientX) {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((clientX - rect.left) / rect.width) * (W + AXIS);
    if (svgX < 0 || svgX > W) { setHover(null); return }
    setHover(Math.max(0, Math.min(rows.length - 1, Math.floor(svgX / step))));
  }
  function onKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setHover(h => Math.max(0, Math.min(rows.length - 1, (h ?? rows.length - 1) + (e.key === 'ArrowLeft' ? -1 : 1))));
    }
    if (e.key === 'Escape') setHover(null);
  }
  const tipLeft = hover != null ? `${Math.min(78, Math.max(2, (x(hover) / (W + AXIS)) * 100))}%` : 0;
  const markerAt = hover != null ? placed.filter(m => m.i === hover) : [];

  return <div className="market-chart-wrap price-chart" ref={wrap}
    onPointerMove={e => pick(e.clientX)} onPointerLeave={() => setHover(null)}
    tabIndex={0} onKeyDown={onKey} role="group"
    aria-label={`${mode === 'line' ? 'Price line' : 'Candlestick'} chart in US dollars with volume. Use the left and right arrow keys to read candles.`}>
    <svg viewBox={`0 0 ${W + AXIS} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {[0, .25, .5, .75, 1].map((v, i) => <g key={i}>
        <line x1="0" x2={W} y1={PRICE_TOP + v * (PRICE_BOTTOM - PRICE_TOP)} y2={PRICE_TOP + v * (PRICE_BOTTOM - PRICE_TOP)} className="market-gridline" />
        <text x={W + 8} y={PRICE_TOP + v * (PRICE_BOTTOM - PRICE_TOP) + 4} className="market-axis">${fmt(hi - v * span)}</text>
      </g>)}
      {rows.map((r, i) => <rect key={'v' + r[0]} x={x(i) - Math.max(1, step * .3)} y={vy(r[5])} width={Math.max(1.5, step * .6)} height={Math.max(0, VOL_BOTTOM - vy(r[5]))} className={'price-volume ' + (r[4] >= r[1] ? 'is-up' : 'is-down')} />)}
      <text x={W + 8} y={VOL_TOP + 8} className="market-axis">Vol</text>
      {placed.filter(m => m.kind === 'graduated' || m.kind === 'pool').map(m => <g key={m.kind} className={'price-event is-' + m.kind}>
        <line x1={x(m.i)} x2={x(m.i)} y1={PRICE_TOP - 6} y2={VOL_BOTTOM} />
        <text x={Math.min(W - 70, x(m.i) + 5)} y={PRICE_TOP + 4}>{m.label}</text>
      </g>)}
      {mode === 'line'
        ? <polyline points={rows.map((r, i) => `${x(i)},${y(r[4])}`).join(' ')} className="market-line" />
        : rows.map((r, i) => {
          const up = r[4] >= r[1], top = Math.min(y(r[1]), y(r[4])), h = Math.max(1, Math.abs(y(r[1]) - y(r[4])));
          return <g key={r[0]} className={up ? 'market-up' : 'market-down'}><line x1={x(i)} x2={x(i)} y1={y(r[2])} y2={y(r[3])} /><rect x={x(i) - Math.max(1, step * .28)} y={top} width={Math.max(2, step * .56)} height={h} /></g>;
        })}
      {placed.filter(m => m.kind === 'buy' || m.kind === 'sell').map((m, k) => {
        const r = rows[m.i], cx = x(m.i);
        return m.kind === 'buy'
          ? <path key={'t' + k} className="price-trade is-buy" d={`M${cx} ${y(r[3]) + 5}l5 9h-10z`} />
          : <path key={'t' + k} className="price-trade is-sell" d={`M${cx} ${y(r[2]) - 5}l5 -9h-10z`} />;
      })}
      <line x1="0" x2={W} y1={y(last[4])} y2={y(last[4])} className="price-last" />
      <rect x={W + 2} y={y(last[4]) - 9} width={AXIS - 4} height="18" rx="4" className="price-last-tag" />
      <text x={W + 8} y={y(last[4]) + 4} className="price-last-text">${fmt(last[4])}</text>
      {active && <g className="price-crosshair">
        <line x1={x(hover)} x2={x(hover)} y1={PRICE_TOP - 6} y2={VOL_BOTTOM} />
        <line x1="0" x2={W} y1={y(active[4])} y2={y(active[4])} />
      </g>}
      <text x="0" y={H - 6} className="market-axis">{new Date(rows[0][0] * 1000).toLocaleDateString()}</text>
      <text x={W - 82} y={H - 6} className="market-axis">{new Date(last[0] * 1000).toLocaleDateString()}</text>
    </svg>
    {active && <div className="price-tooltip" style={{ left: tipLeft }} role="status" aria-live="polite">
      <time>{new Date(active[0] * 1000).toLocaleString([], bucket >= 86400 ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' })}</time>
      <span>O <b>${fmt(active[1])}</b></span><span>H <b>${fmt(active[2])}</b></span><span>L <b>${fmt(active[3])}</b></span><span>C <b>${fmt(active[4])}</b></span>
      <span className={active[4] >= active[1] ? 'market-positive' : 'market-negative'}>{active[1] ? `${((active[4] - active[1]) / active[1] * 100).toFixed(2)}%` : ''}</span>
      <span>Vol <b>{fmtVol(active[5])}</b></span>
      {markerAt.map((m, k) => <em key={k} className={'is-' + m.kind}>{m.label}</em>)}
    </div>}
    {showMarkers && offscreen > 0 && <p className="price-offscreen">{offscreen} marker{offscreen === 1 ? '' : 's'} outside this range. Try a wider period.</p>}
  </div>;
}
