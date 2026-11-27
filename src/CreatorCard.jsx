import React, { useEffect, useState } from 'react';
import { getCreatorHistory } from './api';
import { fetchJSON } from './MarketBoard';
import { timeAgo } from './GraduatedFeed';
import CreatorProfile from './CreatorProfile';

const chainId = { 'Robinhood Chain': 'rhc', Base: 'base', 'SPCX Chain': 'spcx' };
const network = { rhc: 'robinhood', base: 'base' };
const explorers = { rhc: 'https://robinhoodchain.blockscout.com', base: 'https://basescan.org', spcx: 'https://explorer.spcxchain.network' };
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';

// Plain-language read of a creator's indexed history. Facts only; never a safety verdict.
export function creatorTags({ launches = 0, graduated = 0, firstLaunchAt, lastLaunchAt }, now = Date.now()) {
  const tags = [];
  if (launches <= 1) tags.push({ tone: 'neutral', label: 'First launch seen' });
  if (graduated > 0) tags.push({ tone: 'good', label: `${graduated} graduated` });
  if (launches >= 10) tags.push({ tone: 'warn', label: 'Serial launcher' });
  const first = Date.parse(firstLaunchAt || ''), last = Date.parse(lastLaunchAt || '');
  if (launches >= 5 && Number.isFinite(first) && Number.isFinite(last) && last - first < 24 * 3600 * 1000) tags.push({ tone: 'warn', label: `${launches} launches in under a day` });
  if (launches >= 3 && graduated === 0) tags.push({ tone: 'warn', label: 'None graduated yet' });
  return tags;
}

export default function CreatorCard({ item, endpoint, wallet }) {
  const chain = chainId[item?.chain];
  const isOrbit = chain === 'spcx';
  const [state, setState] = useState({ status: 'loading' });
  const [names, setNames] = useState({});
  useEffect(() => {
    if (!chain || !item?.token) { setState({ status: 'unsupported' }); return }
    let active = true, retry, attempts = 0;
    const controller = new AbortController();
    setState({ status: 'loading' });
    setNames({});
    // Retry a failed lookup (for example during a backend deploy) instead of staying on the error.
    const load = () => getCreatorHistory(endpoint, chain, item.token).then(async data => {
      if (!active) return;
      setState({ status: data.found ? 'ready' : 'unknown', data });
      const others = (data.recent || []).map(r => r.token).filter(t => t !== item.token.toLowerCase()).slice(0, 5);
      if (data.found && others.length && chain !== 'spcx') {
        try {
          const json = await fetchJSON(endpoint, `networks/${network[chain]}/tokens/multi/${others.join(',')}`, controller.signal);
          if (active) setNames(Object.fromEntries((json.data || []).map(t => [t.attributes?.address?.toLowerCase(), t.attributes?.symbol || t.attributes?.name])));
        } catch {}
      }
    }).catch(() => {
      if (!active) return;
      attempts += 1;
      setState({ status: 'error', retrying: attempts < 6 });
      if (attempts < 6) retry = setTimeout(load, Math.min(10000 * attempts, 30000));
    });
    load();
    return () => { active = false; controller.abort(); clearTimeout(retry) };
  }, [chain, item?.token, endpoint]);

  if (state.status === 'unsupported') return null;
  const data = state.data || {};
  const since = data.indexedSince ? new Date(data.indexedSince).toLocaleDateString([], { dateStyle: 'medium' }) : null;
  return <section className="lp-card creator-card" aria-labelledby="creator-card-title">
    <h3 id="creator-card-title">Creator</h3>
    {state.status === 'loading' ? <p className="creator-muted" role="status">Looking up who launched this token…</p>
      : state.status === 'error' ? <p className="creator-muted" role="status">Creator history is unavailable right now.{state.retrying ? ' Retrying…' : ''}</p>
        : state.status === 'unknown' ? <p className="creator-muted">{data.history?.supported && !data.history.complete
          ? <>{isOrbit?'Slipway is still loading Orbit launch history':'Slipway is still loading the full Pons launch history'}{since ? ` (now back to ${since})` : ''}. This token's creator appears here as soon as its launch is reached. Check back shortly.</>
          : data.history?.supported
            ? <>No {isOrbit?'Orbit':'Pons'} launch record for this token, so it was created outside that launchpad and has no launchpad creator history.</>
            : <>No Clanker launch record for this token since Slipway began indexing Base{since ? ` on ${since}` : ''}. Older Base launches, or tokens created outside Clanker, have no creator history here.</>}</p>
          : <>
            <p className="creator-address">
              <a href={`${explorers[chain]}/address/${data.creator}`} target="_blank" rel="noreferrer">{short(data.creator)} ↗</a>
              <span>launched this {timeAgo(data.launchedAt)}</span>
            </p>
            <CreatorProfile chain={chain} token={item.token} creator={data.creator} wallet={wallet} endpoint={endpoint} />
            <dl className="creator-stats">
              <div><dt>Launches</dt><dd>{data.launches}{data.capped ? '+' : ''}</dd></div>
              {!isOrbit&&<div><dt>Graduated</dt><dd>{data.graduated}{data.launches ? <small> ({Math.round((data.graduated / data.launches) * 100)}%)</small> : null}</dd></div>}
              <div><dt>First seen</dt><dd>{data.firstLaunchAt ? timeAgo(data.firstLaunchAt) : '—'}</dd></div>
            </dl>
            {!isOrbit&&creatorTags(data).length > 0 && <ul className="creator-tags">{creatorTags(data).map(t => <li key={t.label} className={'is-' + t.tone}>{t.label}</li>)}</ul>}
            {(data.recent || []).length > 1 && <>
              <p className="creator-label">Recent launches</p>
              <ul className="creator-recent">{data.recent.map(r => <li key={r.token}>
                <a href={`${explorers[chain]}/token/${r.token}`} target="_blank" rel="noreferrer">{r.token === item.token.toLowerCase() ? 'This token' : names[r.token] ? `$${names[r.token]}` : short(r.token)}</a>
                <span>{timeAgo(r.at)}</span>
                {r.graduated && <b className="graduated-chip">Graduated</b>}
              </li>)}</ul>
            </>}
            <p className="creator-muted">{data.history?.complete ? 'Full Pons launch history.' : `From launches Slipway has indexed${since ? ` since ${since}` : ''}${data.history?.supported ? '; older history is still loading' : ''}.`} History only, not a safety rating.</p>
          </>}
  </section>;
}
