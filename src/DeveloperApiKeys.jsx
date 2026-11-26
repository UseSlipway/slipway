import React, { useCallback, useEffect, useState } from 'react'
import { Modal } from './App'
import { createDeveloperApiKey, listDeveloperApiKeys, revokeDeveloperApiKey } from './api'
import './developer-api-keys.css'

const publicApiBase = 'https://slipway-api.onrender.com/public/v1'

export default function DeveloperApiKeys({ endpoint, sessionToken, wallet }) {
  const [keys, setKeys] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [secret, setSecret] = useState('')
  const [pendingRevoke, setPendingRevoke] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const refresh = useCallback(async () => {
    if (!sessionToken) { setKeys([]); return }
    setLoading(true); setError('')
    try { const result = await listDeveloperApiKeys(endpoint, sessionToken); setKeys(result.keys || []) }
    catch (e) { setError(e.message || 'Could not load API keys.') }
    finally { setLoading(false) }
  }, [endpoint, sessionToken])
  useEffect(() => { refresh() }, [refresh])

  async function create(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await createDeveloperApiKey(endpoint, sessionToken, name)
      setKeys(current => [result.apiKey, ...current]); setSecret(result.key); setCopied(false); setCopyError(''); setName('')
    } catch (e) { setError(e.message || 'Could not create API key.') }
    finally { setBusy(false) }
  }
  async function revoke() {
    if (!pendingRevoke) return
    setBusy(true); setError('')
    try { await revokeDeveloperApiKey(endpoint, sessionToken, pendingRevoke.id); setPendingRevoke(null); await refresh() }
    catch (e) { setError(e.message || 'Could not revoke API key.') }
    finally { setBusy(false) }
  }
  async function copySecret() {
    try { await navigator.clipboard.writeText(secret); setCopied(true) }
    catch { setCopyError('Clipboard access is unavailable. Select the key above and copy it manually.') }
  }

  return <section className="workspace-panel developer-api-keys" aria-labelledby="developer-api-title">
    <div className="panel-header"><div><h2 id="developer-api-title">Developer API keys</h2><p>Create a key for server-side integrations. Keys belong to this connected wallet.</p></div></div>
    {!sessionToken ? <div className="empty-state"><h3>Connect your wallet workspace</h3><p>Sign in with your wallet to create and manage API keys.</p></div> : <>
      <form className="developer-api-create" onSubmit={create}>
        <label>Key name<input value={name} onChange={e => setName(e.target.value)} maxLength={60} required placeholder="e.g. Trading service" /></label>
        <button className="button" disabled={busy || loading || keys.filter(key => !key.revokedAt).length >= 10}>{busy ? 'Working…' : 'Create API key'}</button>
      </form>
      <p className="developer-api-note">The full key is shown once. Store it in your server’s secret manager; never put it in browser code or commit it to a repository. Limit: 10 active keys per wallet. Rate limit: 120 requests per minute per key.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="developer-api-list" aria-live="polite">
        {loading && !keys.length ? <p role="status">Loading API keys…</p> : keys.length ? keys.map(key => <article key={key.id} className={key.revokedAt ? 'is-revoked' : ''}>
          <div><strong>{key.name}</strong><code>{key.prefix}…</code><small>{key.revokedAt ? 'Revoked' : key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : `Created ${new Date(key.createdAt).toLocaleDateString()} · never used`}</small></div>
          {!key.revokedAt && <button className="text-button" type="button" disabled={busy} onClick={() => setPendingRevoke(key)}>Revoke</button>}
        </article>) : !loading && !error ? <p>No API keys yet.</p> : null}
      </div>
      <div className="developer-api-reference">
        <h3>Public API</h3>
        <p>Use the key as a bearer token from your server. Keep it out of browser code and call the API server to server.</p>
        <code className="developer-api-base">{publicApiBase}</code>
        <pre>{`curl ${publicApiBase}/chains -H "Authorization: Bearer $SLIPWAY_API_KEY"`}</pre>
        <p>Read chains, token routes, market data and events; request trade or launch quotes; build unsigned transactions for the user’s wallet to sign. The API never receives private keys.</p>
        <a href="/developers#public-api">Endpoint reference ↗</a>
      </div>
    </>}
    {secret && <Modal title="Copy your API key" onClose={() => setSecret('')}><p>This key will only be shown once. Save it somewhere secure before closing.</p><input className="developer-api-secret" aria-label="New API key" value={secret} readOnly onFocus={e => e.target.select()} />{copyError && <p className="form-error" role="alert">{copyError}</p>}<button className="button" onClick={copySecret}>{copied ? 'Copied' : 'Copy API key'}</button></Modal>}
    {pendingRevoke && <Modal title="Revoke API key?" onClose={() => setPendingRevoke(null)}><p>Requests using “{pendingRevoke.name}” will stop working immediately. This cannot be undone.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="developer-api-confirm"><button className="text-button" disabled={busy} onClick={() => setPendingRevoke(null)}>Keep key</button><button className="button" disabled={busy} onClick={revoke}>{busy ? 'Revoking…' : 'Revoke key'}</button></div></Modal>}
  </section>
}
