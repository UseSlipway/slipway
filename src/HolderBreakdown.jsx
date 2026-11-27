import React, { useEffect, useState } from 'react';
import { getHolderBreakdown } from './api';

const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
const percent = value => value == null || !Number.isFinite(Number(value)) ? 'Unavailable' : `${Number(value).toFixed(2)}%`;

export default function HolderBreakdown({ item, endpoint }) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    getHolderBreakdown(endpoint, item.chain === 'Robinhood Chain' ? 'rhc' : item.chain === 'SPCX Chain' ? 'spcx' : 'base', item.token)
      .then(data => { if (active) setState({ status: 'ready', data }) })
      .catch(error => { if (active) setState({ status: 'error', message: error.message }) });
    return () => { active = false };
  }, [endpoint, item.chain, item.token]);

  const data = state.data || {};
  const concentrationWarning = data.top10SharePercent >= 50 || data.creatorSharePercent >= 20;
  return <section className="lp-card holder-breakdown" aria-labelledby="holder-breakdown-title">
    <div className="holder-breakdown-heading">
      <div><h3 id="holder-breakdown-title">Holder breakdown</h3><p>Ownership data is a snapshot, not a safety rating.</p></div>
      {concentrationWarning && <span className="holder-caution">Concentration caution</span>}
    </div>
    {state.status === 'loading'
      ? <p className="holder-status" role="status">Loading holder data…</p>
      : state.status === 'error'
        ? <p className="holder-status" role="status">Holder data is temporarily unavailable. {state.message}</p>
        : <>
          <dl className="holder-metrics">
            <div><dt>Holders</dt><dd>{data.holderCount == null ? 'Unavailable' : Number(data.holderCount).toLocaleString()}</dd></div>
            <div><dt>Top 10 share</dt><dd>{percent(data.top10SharePercent)}</dd></div>
            <div><dt>Creator share</dt><dd>{percent(data.creatorSharePercent)}</dd></div>
          </dl>
          {data.creator && <p className="holder-creator">Creator wallet <code title={data.creator}>{short(data.creator)}</code></p>}
          {concentrationWarning && <p className="holder-caution-copy">A large share of supply is concentrated in the top holders or creator wallet. Check the figures and token context before trading.</p>}
          {data.provider && <p className="holder-source">{data.provider}{data.providerUpdatedAt ? ` · provider updated ${new Date(data.providerUpdatedAt).toLocaleString()}` : ''}{data.stale ? ' · showing cached data while refresh is unavailable' : ` · checked ${new Date(data.fetchedAt).toLocaleTimeString()}`}</p>}
          {(!data.provider || (data.holderCount == null && data.top10SharePercent == null)) && <p className="holder-source">The current provider does not have holder coverage for this token on this network. Missing values are not inferred.</p>}
        </>}
  </section>;
}
