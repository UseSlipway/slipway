import React, { useEffect, useState } from 'react';
import { getEvents } from '../../api';
import MarketBoard from '../../MarketBoard';
import './WidgetGridThree.css';

export default function WidgetGridThree({ workspace, onAction }) {
  const [events, setEvents] = useState([]);
  const [eventError, setEventError] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsUpdated, setEventsUpdated] = useState(null);
  const [eventsRetry, setEventsRetry] = useState(0);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true;
    const endpoint = workspace.settings?.endpoint;
    const load = async () => {
      if (active) setEventsLoading(true);
      try {
        const result = await getEvents(endpoint, { limit: 12 });
        if (active) { setEvents(result.events || result.data || []); setEventError(''); setEventsUpdated(Date.now()); }
      } catch (error) { if (active) setEventError(error.message || 'Event feed unavailable.'); }
      finally { if (active) setEventsLoading(false); }
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [workspace.settings?.endpoint, eventsRetry]);
  return <section className="workspace-panel" aria-label="Live workspace overview">
    <div className="panel-header"><div><h2>Live markets</h2><p>Market data from GeckoTerminal for Base and Robinhood Chain; SPCX launch events are shown separately.</p></div><button className="button" onClick={() => onAction('launch')}>Prepare a launch</button></div>
    <MarketBoard chain="Any chain" setChain={() => {}} query="" onSelect={setSelected} layout="list" setLayout={() => {}} filter="Market cap" setFilter={() => {}} data={workspace}/>
    {selected && <div className="empty-state"><h3>{selected.name} ({selected.symbol})</h3><p>{selected.chain} · {selected.pair} · {selected.pool}</p><button className="button" onClick={() => onAction('trade', selected)}>Open trade</button><button className="text-button" onClick={() => setSelected(null)}>Close</button></div>}
    <section className="live-events"><div className="panel-header"><div><h2>Recent onchain events</h2><p>Slipway event index · {eventsUpdated ? `updated ${new Date(eventsUpdated).toLocaleTimeString()}` : eventsLoading ? 'checking status…' : 'not updated yet'}</p></div><span>{events.length} events</span></div>
      {eventError && events.length > 0 && <p role="status" className="backend-status">Could not refresh the event index. Showing the last successful result from {eventsUpdated ? new Date(eventsUpdated).toLocaleTimeString() : 'the previous check'}.</p>}
      {eventsLoading && !events.length ? <p className="ws-loading" role="status">Loading indexed events…</p> : eventError && !events.length ? <div className="empty-state"><h3>Event feed unavailable</h3><p>{eventError}</p><button className="button" onClick={() => setEventsRetry(value => value + 1)}>Try again</button></div> : events.length ? <ul className="activity-list">{events.map((event, index) => <li key={event.id || event.eventId || `${event.type}-${index}`}><span>{event.type || event.eventType || event.event_type || event.event || 'Onchain event'}</span><time>{(event.timestamp || event.created_at) ? new Date(event.timestamp || event.created_at).toLocaleString() : (event.blockNumber || event.block_number) ? `Block ${event.blockNumber || event.block_number}` : event.chain || ''}</time></li>)}</ul> : <div className="empty-state"><h3>No indexed events yet</h3><p>The event index is current and no recent launches, pool graduations or initialized pools were returned.</p></div>}
    </section>
    <div className="dash-bottom"><span>{workspace.drafts.length} saved launch drafts · {workspace.watches.length} saved watchlist entries</span><button className="text-button" onClick={() => onAction('settings')}>Workspace settings</button></div>
  </section>;
}
