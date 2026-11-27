import React, { useEffect, useMemo, useState } from 'react';
import { getCreatorHistory, getHolderBreakdown, getTokenDuplicates } from './api';
import { money } from './MarketBoard';

const chainId = { 'Robinhood Chain': 'rhc', Base: 'base', 'SPCX Chain': 'spcx' };
const empty = { holders: { status: 'loading' }, creator: { status: 'loading' }, duplicates: { status: 'loading' }, checkedAt: null };

function finding(label, state, value, tone = 'reported') {
  return { label, status: state, value, tone };
}

function summarize(item, report, resolvedRoute, updated) {
  const rows = [];
  rows.push(finding('Sellability and transfer tax', 'Unknown', 'A price quote does not simulate a real token transfer. This version does not claim that selling will succeed or determine transfer tax.', 'unknown'));

  if (report.holders.status === 'loading') rows.push(finding('Holder concentration', 'Checking', 'Loading holder data.', 'loading'));
  else if (report.holders.status === 'ready') {
    const d = report.holders.data;
    const parts = [];
    if (d.holderCount != null) parts.push(`${Number(d.holderCount).toLocaleString()} holders`);
    if (d.top10SharePercent != null) parts.push(`top 10: ${Number(d.top10SharePercent).toFixed(2)}%`);
    if (d.creatorSharePercent != null) parts.push(`creator: ${Number(d.creatorSharePercent).toFixed(2)}%`);
    const concentration = Number(d.top10SharePercent) >= 50 || Number(d.creatorSharePercent) >= 20;
    rows.push(finding('Holder concentration', parts.length ? (concentration ? 'Review concentration' : 'Snapshot available') : 'Unknown', parts.length ? `${parts.join(' · ')}${d.provider ? ` · ${d.provider}` : ''}${d.stale ? ' · cached snapshot' : ''}` : 'No holder metrics are available for this token and chain.', parts.length ? concentration ? 'review' : 'reported' : 'unknown'));
  } else rows.push(finding('Holder concentration', 'Unknown', 'Holder data could not be loaded.', 'unknown'));

  if (report.creator.status === 'loading') rows.push(finding('Creator history', 'Checking', 'Looking up indexed launches.', 'loading'));
  else if (report.creator.status === 'ready' && report.creator.data.found) {
    const d = report.creator.data;
    rows.push(finding('Creator history', 'History found', `${d.launches}${d.capped ? '+' : ''} indexed launches · ${d.graduated} graduations · history since ${d.indexedSince ? new Date(d.indexedSince).toLocaleDateString() : 'unknown'}. Counts cover Slipway-indexed events only.`));
  } else rows.push(finding('Creator history', 'Unknown', 'No indexed creator record was returned. This is not evidence of a new or trusted creator.', 'unknown'));

  if (report.duplicates.status === 'loading') rows.push(finding('Name and ticker overlap', 'Checking', 'Searching available indexed launches and market pools.', 'loading'));
  else if (report.duplicates.status === 'ready') {
    const d = report.duplicates.data;
    const complete = d.sourceAvailability?.indexedLaunches === 'available' && d.sourceAvailability?.marketSearches === d.sourceAvailability?.marketSearchesExpected;
    rows.push(finding('Name and ticker overlap', d.matches > 0 ? `${d.matches} match${d.matches === 1 ? '' : 'es'} found` : complete ? 'No matches in checked sources' : 'Unknown · partial coverage', d.matches > 0 ? `${d.indexedLaunchMatches} indexed launch match(es) · ${d.marketDataMatches} market match(es). Similar names do not establish a relationship.` : complete ? 'Searches covered available indexed launch metadata and market pools. Index coverage may still be incomplete.' : 'One or more search sources were unavailable or indexed metadata was incomplete.', d.matches > 0 ? 'review' : complete ? 'reported' : 'unknown'));
  } else rows.push(finding('Name and ticker overlap', 'Unknown', 'Overlap checks could not be loaded.', 'unknown'));

  const liquidity = Number(item?.liquidity);
  rows.push(Number.isFinite(liquidity) && liquidity > 0
    ? finding('Pool liquidity', 'Market snapshot', `${money(liquidity)} reported by GeckoTerminal${updated ? ` · checked ${new Date(updated).toLocaleTimeString()}` : ''}. This may not be the exact route used for a trade.`)
    : finding('Pool liquidity', 'Unknown', 'No current pool liquidity figure is available.', 'unknown'));

  rows.push(resolvedRoute
    ? finding('Token and route', 'Resolved', `${resolvedRoute.venueBrand || resolvedRoute.venue} · ${resolvedRoute.phase?.replaceAll('_', ' ').toLowerCase() || 'phase unavailable'} · ${resolvedRoute.source || 'Slipway'}`)
    : finding('Token and route', 'Unknown', 'Slipway has not confirmed a supported route for this token.', 'unknown'));

  rows.push(finding('LP lock', 'Unknown', 'No verified lock check is available for this venue and pool.', 'unknown'));
  rows.push(finding('Image similarity', 'Unknown', 'Image look-alike checks are not available for this token.', 'unknown'));
  rows.push(finding('Transfer tax and token controls', 'Unknown', 'Generic mint, pause, blacklist, and transfer-tax checks are not verified for this token.', 'unknown'));
  return { rows, checkedAt: report.checkedAt, resolvedRoute };
}

export default function XRayReport({ item, endpoint, resolvedRoute, updated, onReport }) {
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState(empty);
  useEffect(() => {
    let active = true;
    setReport(empty);
    const update = (key, value) => { if (active) setReport(current => ({ ...current, [key]: value, checkedAt: new Date().toISOString() })) };
    const chain = chainId[item?.chain];
    if (!chain || !item?.token) return () => { active = false };
    getHolderBreakdown(endpoint, chain, item.token).then(data => update('holders', { status: 'ready', data })).catch(() => update('holders', { status: 'error' }));
    getCreatorHistory(endpoint, chain, item.token).then(data => update('creator', { status: 'ready', data })).catch(() => update('creator', { status: 'error' }));
    getTokenDuplicates(endpoint, item).then(data => update('duplicates', { status: 'ready', data })).catch(() => update('duplicates', { status: 'error' }));
    return () => { active = false };
  }, [endpoint, item?.chain, item?.token, item?.name, item?.symbol, item?.cap, item?.created, item?.liquidity, revision]);

  const result = useMemo(() => summarize(item, report, resolvedRoute, updated), [item, report, resolvedRoute, updated]);
  useEffect(() => { onReport?.(result) }, [result, onReport]);
  const reviewCount = result.rows.filter(row => row.tone === 'review').length;
  const unknownCount = result.rows.filter(row => row.tone === 'unknown').length;
  return <section className="lp-card xray-report" aria-labelledby="xray-title">
    <header className="xray-heading"><div><span className="xray-eyebrow">PRE-TRADE CONTEXT</span><h3 id="xray-title">X-Ray</h3><p>Evidence from available chain and market data. No safety score.</p></div><button type="button" className="lp-secondary" onClick={() => setRevision(value => value + 1)}>Refresh</button></header>
    <div className="xray-summary" role="status">{reviewCount ? `${reviewCount} finding${reviewCount === 1 ? '' : 's'} to review` : 'Review the available checks'} · {unknownCount} unknown</div>
    <div className="xray-findings">{result.rows.map(row => <article className={`xray-finding is-${row.tone}`} key={row.label}><div><strong>{row.label}</strong><span>{row.status}</span></div><p>{row.value}</p>{row.label === 'Name and ticker overlap' && report.duplicates.status === 'ready' && report.duplicates.data.samples?.length > 0 && <ul>{report.duplicates.data.samples.slice(0, 3).map((match, index) => <li key={`${match.chain}-${match.token}-${index}`}>{match.name || 'Unnamed'} ({match.symbol || '—'}) · {{ rhc: 'Robinhood Chain', base: 'Base', spcx: 'SPCX Chain' }[match.chain] || match.chain}</li>)}</ul>}</article>)}</div>
    {resolvedRoute && <p className="xray-source">Route context: {resolvedRoute.venueBrand || resolvedRoute.venue} · {resolvedRoute.phase?.replaceAll('_', ' ').toLowerCase()} · {resolvedRoute.source || 'Slipway'}{resolvedRoute.resolvedAt ? ` · checked ${new Date(resolvedRoute.resolvedAt).toLocaleTimeString()}` : ''}</p>}
    {result.checkedAt && <p className="xray-source">Checks refreshed {new Date(result.checkedAt).toLocaleTimeString()}. Some provider and index data can be delayed.</p>}
    <p className="xray-disclaimer">A quote is not an execution test. Unknown means unverified, not clear. A token can change after these checks.</p>
  </section>;
}

export function XRayQuoteSummary({ report }) {
  return <details className="trade-quote-details xray-quote-details"><summary>X-Ray results {report?.checkedAt ? `· checked ${new Date(report.checkedAt).toLocaleTimeString()}` : '· still loading'}</summary>{report?.rows ? <ul>{report.rows.map(row => <li key={row.label}><strong>{row.label}: {row.status}</strong> · {row.value}</li>)}</ul> : <p>The token report is still loading. Review the X-Ray panel before signing.</p>}</details>;
}
