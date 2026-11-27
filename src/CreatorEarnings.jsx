import React, { useCallback, useEffect, useState } from 'react';
import { useConnectorClient } from 'wagmi';
import { getCreatorEarnings, buildCreatorClaim, submitBuiltTransactions, formatTokenAmount } from './api';

const chainName = { rhc: 'Robinhood Chain', base: 'Base' };
const venueName = { pons: 'Pons', clanker: 'Clanker' };
const explorers = { rhc: 'https://robinhoodchain.blockscout.com', base: 'https://basescan.org' };

export function claimKey(balance) { return `${balance.chain}:${balance.asset}` }

// Launch-fee balances the connected wallet can claim from Pons and Clanker, with one-click claims.
// Claims are unsigned transactions to the launchpads' own fee contracts; the wallet signs them.
export default function CreatorEarnings({ wallet, endpoint }) {
  const { data: connectorClient } = useConnectorClient();
  const [state, setState] = useState({ status: 'loading', balances: [] });
  const [claims, setClaims] = useState({});
  const load = useCallback(async () => {
    try {
      const data = await getCreatorEarnings(endpoint, wallet);
      setState({ status: 'ready', balances: data.balances || [], unavailable: data.unavailable || [], checkedAt: data.checkedAt });
    } catch (error) {
      setState(s => ({ ...s, status: s.balances.length ? 'ready' : 'error', error: error.message }));
    }
  }, [endpoint, wallet]);
  useEffect(() => {
    if (!wallet) return;
    setState({ status: 'loading', balances: [] });
    setClaims({});
    load();
  }, [wallet, load]);

  async function claim(balance) {
    const key = claimKey(balance);
    setClaims(c => ({ ...c, [key]: { phase: 'building' } }));
    try {
      const build = await buildCreatorClaim(endpoint, { chain: balance.chain, wallet, asset: balance.asset });
      setClaims(c => ({ ...c, [key]: { phase: 'signing' } }));
      const provider = connectorClient?.transport ? { request: args => connectorClient.transport.request(args) } : window.ethereum;
      const results = await submitBuiltTransactions(endpoint, build, provider, status => setClaims(c => ({ ...c, [key]: { phase: status.status === 'confirmed' ? 'confirmed' : 'pending', hash: status.hash } })));
      const final = results.at(-1);
      setClaims(c => ({ ...c, [key]: { phase: 'confirmed', hash: final?.hash } }));
      setTimeout(load, 4000);
    } catch (error) {
      const rejected = error?.code === 4001 || /reject|denied/i.test(error?.message || '');
      setClaims(c => ({ ...c, [key]: { phase: 'error', error: rejected ? 'You cancelled the claim in your wallet.' : error.message } }));
    }
  }

  if (!wallet) return null;
  const visible = state.balances;
  return <section className="workspace-panel ws-panel creator-earnings" aria-labelledby="creator-earnings-title">
    <div className="panel-header"><div><h2 id="creator-earnings-title">Creator earnings</h2><p>Launch fees this wallet can claim from Pons and Clanker. Claims go straight to each launchpad's fee contract; your wallet signs.</p></div>
      <button type="button" className="ws-more" onClick={load} disabled={state.status === 'loading'}>Refresh</button></div>
    {state.status === 'loading' ? <p className="ws-loading" role="status">Checking Pons and Clanker fee balances…</p>
      : state.status === 'error' ? <p role="alert" className="backend-status">{state.error || 'Creator earnings are unavailable right now.'}</p>
        : !visible.length ? <div className="empty-state ws-empty"><h3>Nothing to claim right now</h3><p>When tokens this wallet launched earn fees, they appear here. Pons credits fees once they're swept into its escrow, and Clanker once they're collected into its fee locker.</p></div>
          : <div className="table-wrap ws-table"><table><thead><tr><th>Asset</th><th>Launchpad</th><th>Claimable</th><th><span className="ws-hidden">Action</span></th></tr></thead><tbody>
            {visible.map(balance => {
              const c = claims[claimKey(balance)] || {};
              return <tr key={claimKey(balance)}>
                <td><b>{balance.symbol}</b><small>{chainName[balance.chain]}</small></td>
                <td>{venueName[balance.venue]}</td>
                <td title={balance.formatted}><b>{formatTokenAmount(balance.formatted, 6)}</b> {balance.symbol}</td>
                <td className="ws-actions">
                  {c.phase === 'confirmed' ? <span className="creator-claimed">Claimed{c.hash && <> · <a href={`${explorers[balance.chain]}/tx/${c.hash}`} target="_blank" rel="noreferrer">view ↗</a></>}</span>
                    : <button type="button" className="button" disabled={c.phase && c.phase !== 'error'} onClick={() => claim(balance)}>
                      {c.phase === 'building' ? 'Preparing…' : c.phase === 'signing' ? 'Confirm in wallet…' : c.phase === 'pending' ? 'Confirming…' : 'Claim'}
                    </button>}
                  {c.phase === 'error' && <small className="creator-claim-error" role="alert">{c.error}</small>}
                </td>
              </tr>;
            })}
          </tbody></table></div>}
    {state.status === 'ready' && <p className="ws-note">{(state.unavailable || []).length ? `Couldn't check ${state.unavailable.map(v => venueName[v]).join(' and ')} just now. ` : ''}Balances read from the launchpads' fee contracts{state.checkedAt ? ` at ${new Date(state.checkedAt).toLocaleTimeString()}` : ''}. Pons fees that haven't been swept into escrow yet aren't included.</p>}
  </section>;
}
