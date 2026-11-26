import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './App';

const pageSize = 10;
const plural = noun => /(ch|sh|s|x)$/.test(noun) ? `${noun}es` : `${noun}s`;
const explorers = { 'Base': 'https://basescan.org', 'Robinhood Chain': 'https://robinhoodchain.blockscout.com' };
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
const timeOf = item => Date.parse(item.updatedAt || item.createdAt || item.time || item.indexedAt || '') || 0;
const title = phase => (phase || 'LAUNCHED').replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

function sortItems(items, sort, nameOf = item => item.name || '') {
  const list = [...items];
  if (sort === 'Name A–Z') return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  if (sort === 'Chain') return list.sort((a, b) => (a.chainName || a.chain || '').localeCompare(b.chainName || b.chain || '') || nameOf(a).localeCompare(nameOf(b)));
  if (sort === 'Oldest') return list.sort((a, b) => (timeOf(a) - timeOf(b)) || (Number(a.blockNumber || 0) - Number(b.blockNumber || 0)));
  return list.sort((a, b) => (timeOf(b) - timeOf(a)) || (Number(b.blockNumber || 0) - Number(a.blockNumber || 0)));
}

function usePaged(items, resetKey) {
  const [limit, setLimit] = useState(pageSize);
  useEffect(() => setLimit(pageSize), [resetKey]);
  return [items.slice(0, limit), items.length > limit ? () => setLimit(l => l + pageSize) : null, items.length];
}

function Toolbar({ count, total, noun, sort, setSort, sorts = ['Newest', 'Oldest', 'Name A–Z', 'Chain'], children }) {
  return <div className="ws-toolbar">
    <span className="ws-count" aria-live="polite">{count === total ? `${total} ${total === 1 ? noun : plural(noun)}` : `${count} of ${total} ${plural(noun)}`}</span>
    <div className="ws-toolbar-controls">
      {children}
      {sorts.length > 1 && <label className="ws-select"><span>Sort</span><select value={sort} onChange={e => setSort(e.target.value)}>{sorts.map(s => <option key={s}>{s}</option>)}</select></label>}
    </div>
  </div>;
}

function More({ onMore, shown, total }) {
  if (!onMore) return null;
  return <button type="button" className="ws-more" onClick={onMore}>Show more <span>({shown} of {total})</span></button>;
}

function Empty({ icon, heading, body, action, onAction }) {
  return <div className="empty-state ws-empty"><Icon name={icon} /><h3>{heading}</h3><p>{body}</p>{onAction && <button className="button" onClick={onAction}>{action}</button>}</div>;
}

function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) } catch {} }}>{done ? 'Copied' : label}</button>;
}

// Who owns this workspace, and is it synced? Also calls out wallet switches so users
// do not mistake another wallet's drafts for their own.
export function WorkspaceIdentity({ wallet, sync, onConnect }) {
  const previous = useRef(wallet);
  const [switched, setSwitched] = useState(null);
  useEffect(() => {
    if (previous.current && wallet && previous.current.toLowerCase() !== wallet.toLowerCase()) setSwitched({ from: previous.current, to: wallet });
    if (!wallet) setSwitched(null);
    previous.current = wallet;
  }, [wallet]);
  const state = !wallet ? 'local' : sync?.ready ? 'synced' : sync?.status && /unavailable|could not|failed|rejected|denied/i.test(sync.status) ? 'error' : 'pending';
  const copy = {
    local: ['Not connected', 'Drafts and watchlist are saved in this browser only. Connect a wallet to sync them and see your onchain launches.'],
    pending: [`Wallet ${short(wallet)}`, sync?.status || 'Connecting your wallet workspace… approve the sign-in message in your wallet.'],
    synced: [`Wallet ${short(wallet)}`, 'Drafts and watchlist are synced to this wallet. Launches below were created by this address.'],
    error: [`Wallet ${short(wallet)}`, `${sync?.status || 'Sync is unavailable.'} Changes stay in this browser until sync works again.`],
  }[state];
  return <div className={`ws-identity is-${state}`} role="status">
    <span className="ws-identity-dot" aria-hidden="true" />
    <div><strong>{copy[0]}{state === 'synced' && <em>Synced</em>}{state === 'pending' && <em>Syncing</em>}{state === 'local' && <em>This device</em>}{state === 'error' && <em>Not synced</em>}</strong><p>{copy[1]}</p>
      {switched && <p className="ws-identity-switch">Switched from {short(switched.from)} to {short(switched.to)}. Showing this wallet's launches, drafts and watchlist. <button type="button" onClick={() => setSwitched(null)}>Dismiss</button></p>}</div>
    {!wallet && <button type="button" className="button" onClick={onConnect}>Connect wallet</button>}
  </div>;
}

export function LaunchesPanel({ launches, drafts, loading, error, wallet, query, onNew, onContinue, onEdit, onDelete }) {
  const [sort, setSort] = useState('Newest'), [phase, setPhase] = useState('All phases');
  const phases = useMemo(() => ['All phases', ...new Set(launches.map(l => title(l.phase)))], [launches]);
  useEffect(() => { if (!phases.includes(phase)) setPhase('All phases') }, [phases, phase]);
  const filtered = launches.filter(l => phase === 'All phases' || title(l.phase) === phase);
  const [shownLaunches, moreLaunches] = usePaged(sortItems(filtered, sort), `${sort}|${phase}|${query}`);
  const [draftSort, setDraftSort] = useState('Newest');
  const [shownDrafts, moreDrafts] = usePaged(sortItems(drafts, draftSort), `${draftSort}|${query}`);
  return <>
    <section className="workspace-panel ws-panel">
      <div className="panel-header"><div><h2>Launched tokens</h2><p>Tokens this wallet created onchain, newest first. Updated every two minutes.</p></div><button className="button" onClick={onNew}>New launch <Icon name="plus" /></button></div>
      {!wallet ? <Empty icon="grid" heading="Connect to see your launches" body="Launches are read from the chain for the connected wallet." />
        : loading && !launches.length ? <p className="ws-loading" role="status">Loading onchain launches…</p>
          : error && !launches.length ? <p role="alert" className="backend-status">{error} Your drafts below are unaffected.</p>
            : !launches.length ? <Empty icon="grid" heading={query ? 'No matching launches' : 'No launches yet'} body={query ? 'Try another name, ticker or address.' : 'Finish a draft and sign it in your wallet. It shows up here once confirmed.'} />
              : <>
                <Toolbar count={filtered.length} total={launches.length} noun="launch" sort={sort} setSort={setSort}>
                  {phases.length > 2 && <label className="ws-select"><span>Phase</span><select value={phase} onChange={e => setPhase(e.target.value)}>{phases.map(p => <option key={p}>{p}</option>)}</select></label>}
                </Toolbar>
                <div className="table-wrap ws-table"><table><thead><tr><th>Token</th><th>Chain</th><th>Venue</th><th>Phase</th><th>Address</th></tr></thead><tbody>
                  {shownLaunches.map(item => <tr key={item.id}><td><b>{item.name}</b><small>${item.symbol}</small></td><td>{item.chainName}</td><td>{item.venue}</td><td><span className="status">{title(item.phase)}</span></td>
                    <td className="ws-actions"><a href={`${explorers[item.chainName]}/token/${item.token}`} target="_blank" rel="noreferrer">{short(item.token)} ↗</a><CopyButton value={item.token} /></td></tr>)}
                </tbody></table></div>
                <More onMore={moreLaunches} shown={shownLaunches.length} total={filtered.length} />
                {launches.length >= 20 && !moreLaunches && <p className="ws-note">Showing your 20 most recent launches.</p>}
              </>}
    </section>
    <section className="workspace-panel ws-panel">
      <div className="panel-header"><div><h2>Drafts</h2><p>Unfinished launches. Continue one to pick up where you left off.</p></div></div>
      {!drafts.length ? <Empty icon="plus" heading={query ? 'No matching drafts' : 'No drafts'} body={query ? 'Try another name or ticker.' : 'Start a launch and choose “Save draft” to come back to it later.'} action="Start a launch" onAction={query ? null : onNew} />
        : <>
          <Toolbar count={drafts.length} total={drafts.length} noun="draft" sort={draftSort} setSort={setDraftSort} />
          <div className="table-wrap ws-table"><table><thead><tr><th>Token</th><th>Chain</th><th>Venue</th><th>Last edited</th><th><span className="ws-hidden">Actions</span></th></tr></thead><tbody>
            {shownDrafts.map(d => <tr key={d.id}><td><b>{d.name || 'Untitled'}</b><small>${d.symbol || '—'}</small></td><td>{d.chain}</td><td>{d.venue}</td><td>{timeOf(d) ? new Date(timeOf(d)).toLocaleDateString([], { dateStyle: 'medium' }) : '—'}</td>
              <td className="ws-actions">{onContinue ? <button onClick={() => onContinue(d)}>Continue</button> : <button onClick={() => onEdit(d)}>Edit</button>}<button onClick={() => onDelete(d)}>Delete</button></td></tr>)}
          </tbody></table></div>
          <More onMore={moreDrafts} shown={shownDrafts.length} total={drafts.length} />
        </>}
    </section>
  </>;
}

export function WatchlistPanel({ watches, total, query, onAdd, onRemove }) {
  const [sort, setSort] = useState('Newest');
  const withOrder = watches.map(w => ({ ...w, order: total.indexOf(w) }));
  const sorted = sort === 'Newest' ? [...withOrder].sort((a, b) => b.order - a.order) : sort === 'Oldest' ? [...withOrder].sort((a, b) => a.order - b.order) : sortItems(withOrder, sort, w => w.symbol || w.name || '');
  const [shown, more] = usePaged(sorted, `${sort}|${query}`);
  return <section className="workspace-panel ws-panel">
    <div className="panel-header"><div><h2>Watchlist</h2><p>Tokens you follow, synced with your wallet workspace.</p></div><button className="button" onClick={onAdd}>Add token <Icon name="plus" /></button></div>
    {!watches.length ? <Empty icon="search" heading={query ? 'No matching tokens' : 'Nothing watched yet'} body={query ? 'Try another name or address.' : 'Watch a token from its market page, or add one by public address.'} action="Add a token" onAction={query ? null : onAdd} />
      : <>
        <Toolbar count={watches.length} total={total.length} noun="token" sort={sort} setSort={setSort} />
        <div className="watch-grid">{shown.map(w => <article key={w.id}>
          <span className="token-initial">{(w.symbol || w.name || '??').slice(0, 2)}</span>
          <h3>{w.name}{w.symbol && w.symbol !== w.name && <small> ${w.symbol}</small>}</h3><span>{w.chain}</span><code>{w.address}</code>
          <div className="ws-actions"><a href={`${explorers[w.chain] || explorers['Robinhood Chain']}/token/${w.address}`} target="_blank" rel="noreferrer">Explorer ↗</a><CopyButton value={w.address} /><button onClick={() => onRemove(w)}>Remove</button></div>
        </article>)}</div>
        <More onMore={more} shown={shown.length} total={watches.length} />
      </>}
  </section>;
}

const activityKinds = ['All activity', 'Launches', 'Drafts', 'Watchlist', 'Settings'];
function kindOf(action = '') {
  const a = action.toLowerCase();
  if (a.startsWith('launched') || a.includes('onchain')) return 'Launches';
  if (a.includes('draft')) return 'Drafts';
  if (a.includes('watchlist') || a.includes('watch')) return 'Watchlist';
  return 'Settings';
}

export function ActivityPanel({ activity, launches, query, onNew }) {
  const [kind, setKind] = useState('All activity');
  const entries = useMemo(() => {
    const known = new Set(activity.map(a => a.action));
    const onchain = launches.filter(l => l.indexedAt).map(l => ({ id: `chain:${l.id}`, time: l.indexedAt, action: `Launched $${l.symbol} on ${l.chainName}`, href: `${explorers[l.chainName]}/tx/${l.transactionHash}`, onchain: true }))
      .filter(e => !known.has(e.action));
    return [...activity, ...onchain].filter(e => e.time && (!query || e.action.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  }, [activity, launches, query]);
  const filtered = entries.filter(e => kind === 'All activity' || kindOf(e.action) === kind);
  const [shown, more] = usePaged(filtered, `${kind}|${query}`);
  const groups = [];
  for (const e of shown) {
    const day = new Date(e.time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1).items.push(e);
  }
  return <section className="workspace-panel ws-panel">
    <div className="panel-header"><div><h2>Activity</h2><p>What happened in this workspace, plus launches confirmed onchain.</p></div></div>
    {!entries.length ? <Empty icon="grid" heading={query ? 'No matching activity' : 'No activity yet'} body={query ? 'Try another search.' : 'Saving a draft, watching a token or launching shows up here.'} action="Start a launch" onAction={query ? null : onNew} />
      : <>
        <Toolbar count={filtered.length} total={entries.length} noun="event" sort="Newest" setSort={() => {}} sorts={['Newest']}>
          <label className="ws-select"><span>Show</span><select value={kind} onChange={e => setKind(e.target.value)}>{activityKinds.map(k => <option key={k}>{k}</option>)}</select></label>
        </Toolbar>
        {!filtered.length ? <p className="ws-note">Nothing in this category yet.</p> : groups.map(g => <div key={g.day} className="ws-day"><h4>{g.day}</h4><ol>{g.items.map(e => <li key={e.id}>
          <time dateTime={e.time}>{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          <span>{e.action}</span><em>{e.onchain ? 'Onchain' : kindOf(e.action)}</em>{e.href && <a href={e.href} target="_blank" rel="noreferrer">Tx ↗</a>}
        </li>)}</ol></div>)}
        <More onMore={more} shown={shown.length} total={filtered.length} />
      </>}
  </section>;
}
