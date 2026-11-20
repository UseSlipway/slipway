import React, { useEffect, useState } from 'react';
import { getEvents } from '../../api';
import MarketBoard from '../../MarketBoard';
import './WidgetGridThree.css';

export default function WidgetGridThree({ workspace, onAction }) {
  const [events, setEvents] = useState([]);
  const [eventError, setEventError] = useState('');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true;
    const endpoint = workspace.settings?.endpoint;
    const load = async () => {
      try {
        const result = await getEvents(endpoint, { limit: 12 });
        if (active) { setEvents(result.events || result.data || []); setEventError(''); }
      } catch (error) { if (active) setEventError(error.message || 'Event feed unavailable.'); }
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [workspace.settings?.endpoint]);
  return <section className="workspace-panel" aria-label="Live workspace overview">
    <div className="panel-header"><div><h2>Live markets</h2><p>Market data from GeckoTerminal for Base and Robinhood Chain.</p></div><button className="button" onClick={() => onAction('launch')}>Prepare a launch</button></div>
    <MarketBoard chain="Any chain" setChain={() => {}} query="" onSelect={setSelected} layout="list" setLayout={() => {}} filter="Market cap" setFilter={() => {}} data={workspace}/>
    {selected && <div className="empty-state"><h3>{selected.name} ({selected.symbol})</h3><p>{selected.chain} · {selected.pair} · {selected.pool}</p><button className="button" onClick={() => onAction('trade', selected)}>Open trade</button><button className="text-button" onClick={() => setSelected(null)}>Close</button></div>}
    <section className="live-events"><div className="panel-header"><div><h2>Recent onchain events</h2><p>Launches, pool graduations and initialized pools.</p></div><span>{events.length} events</span></div>
      {eventError ? <p role="status" className="form-error">{eventError}</p> : events.length ? <ul className="activity-list">{events.map((event, index) => <li key={event.id || event.eventId || `${event.type}-${index}`}><span>{event.type || event.eventType || event.event_type || event.event || 'Onchain event'}</span><time>{(event.timestamp || event.created_at) ? new Date(event.timestamp || event.created_at).toLocaleString() : (event.blockNumber || event.block_number) ? `Block ${event.blockNumber || event.block_number}` : event.chain || ''}</time></li>)}</ul> : <div className="empty-state"><h3>No indexed events yet</h3><p>New events from supported chains will appear here.</p></div>}
    </section>
    <div className="dash-bottom"><span>{workspace.drafts.length} saved launch drafts · {workspace.watches.length} saved watchlist entries</span><button className="text-button" onClick={() => onAction('settings')}>Workspace settings</button></div>
  </section>;
}
