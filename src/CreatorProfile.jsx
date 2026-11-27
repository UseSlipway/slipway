import React, { useEffect, useState } from 'react';
import { getCreatorProfile, saveCreatorProfile, deleteCreatorProfile } from './api';

const hosts = { website: null, x: /^(www\.)?(x|twitter)\.com$/, telegram: /^(www\.)?(t\.me|telegram\.me)$/ };

// Only render links that are https and on the expected host (the server enforces this too).
export function safeLink(value, field) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (hosts[field] && !hosts[field].test(url.hostname)) return null;
    return url.href;
  } catch { return null }
}

function workspaceSession(wallet) {
  try { return localStorage.getItem(`slipway.workspace.session.${wallet.toLowerCase()}`) || '' } catch { return '' }
}

const blank = { description: '', website: '', x: '', telegram: '' };

export default function CreatorProfile({ chain, token, creator, wallet, endpoint }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(blank);
  const [status, setStatus] = useState({ busy: false, error: '', saved: false });
  const isCreator = Boolean(wallet && creator && wallet.toLowerCase() === creator.toLowerCase());

  useEffect(() => {
    let active = true;
    setProfile(null); setEditing(false);
    getCreatorProfile(endpoint, chain, token).then(r => { if (active) setProfile(r.profile) }).catch(() => {});
    return () => { active = false };
  }, [chain, token, endpoint]);

  function startEdit() {
    setForm({ ...blank, ...(profile ? { description: profile.description, website: profile.website, x: profile.x, telegram: profile.telegram } : {}) });
    setStatus({ busy: false, error: '', saved: false });
    setEditing(true);
  }
  async function save(e) {
    e.preventDefault();
    setStatus({ busy: true, error: '', saved: false });
    try {
      const result = await saveCreatorProfile(endpoint, workspaceSession(wallet), { chain, token, ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) });
      setProfile(result.profile); setEditing(false); setStatus({ busy: false, error: '', saved: true });
    } catch (error) {
      setStatus({ busy: false, error: error.status === 401 ? 'Your wallet sign-in expired. Reconnect the wallet in the sidebar and approve the sign-in message, then save again.' : error.message, saved: false });
    }
  }
  async function remove() {
    setStatus({ busy: true, error: '', saved: false });
    try { await deleteCreatorProfile(endpoint, workspaceSession(wallet), chain, token); setProfile(null); setEditing(false); setStatus({ busy: false, error: '', saved: false }) }
    catch (error) { setStatus({ busy: false, error: error.message, saved: false }) }
  }

  const verified = profile?.verified;
  const links = profile ? ['website', 'x', 'telegram'].map(f => [f, safeLink(profile[f], f)]).filter(([, href]) => href) : [];
  return <div className="creator-profile">
    {verified && <div className="creator-verified">
      <span className="creator-verified-badge" title="Signed by the wallet that launched this token">✓ Creator verified</span>
      {profile.description && <p>{profile.description}</p>}
      {links.length > 0 && <div className="creator-links">{links.map(([f, href]) => <a key={f} href={href} target="_blank" rel="noreferrer nofollow">{f === 'x' ? 'X' : f === 'telegram' ? 'Telegram' : 'Website'} ↗</a>)}</div>}
    </div>}
    {isCreator && !editing && <button type="button" className="lp-secondary creator-edit" onClick={startEdit}>{verified ? 'Edit verified details' : 'You launched this · add verified details'}</button>}
    {status.saved && <p className="creator-muted" role="status">Saved. Visitors now see your verified details.</p>}
    {isCreator && editing && <form className="creator-form" onSubmit={save}>
      <p className="creator-muted">Signed with your creator wallet. Only the wallet that launched this token can edit these details.</p>
      <label>About the token<textarea maxLength="280" rows="3" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What it is, in a line or two" /><small>{form.description.length}/280</small></label>
      <label>Website<input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://" inputMode="url" /></label>
      <label>X<input value={form.x} onChange={e => setForm({ ...form, x: e.target.value })} placeholder="https://x.com/yourtoken" inputMode="url" /></label>
      <label>Telegram<input value={form.telegram} onChange={e => setForm({ ...form, telegram: e.target.value })} placeholder="https://t.me/yourtoken" inputMode="url" /></label>
      {status.error && <p className="lp-error" role="alert">{status.error}</p>}
      <div className="creator-form-actions">
        {profile && <button type="button" className="creator-remove" onClick={remove} disabled={status.busy}>Remove</button>}
        <button type="button" className="lp-secondary" onClick={() => setEditing(false)} disabled={status.busy}>Cancel</button>
        <button className="lp-primary" disabled={status.busy}>{status.busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>}
  </div>;
}
