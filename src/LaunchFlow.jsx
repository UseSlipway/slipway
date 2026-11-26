import React, { useState } from 'react';
import { getEvents } from './api';

export const blankLaunch = { name: '', symbol: '', description: '', chain: 'Robinhood Chain', venue: 'Pons', website: '', telegram: '', x: '' };
export const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const imageMaxBytes = 2 * 1024 * 1024;
const progressKey = 'slipway.launch.progress.v1';
const explorers = { 'Base': 'https://basescan.org', 'Robinhood Chain': 'https://robinhoodchain.blockscout.com' };

export function explorerUrl(chain, kind, value) { return `${explorers[chain] || explorers['Robinhood Chain']}/${kind}/${value}` }
export function shortHash(value) { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '' }
function formatBytes(size) { return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB` }

// Unfinished launch: kept on this device so a reload or a detour does not lose the form.
// Local image previews (data URLs) are dropped; only published image URLs are kept.
export function readLaunchProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) || 'null');
    if (!saved?.form || typeof saved.form !== 'object') return null;
    const form = { ...blankLaunch, ...saved.form };
    if (typeof form.image === 'string' && !form.image.startsWith('https://')) delete form.image;
    return { form, step: saved.step === 2 ? 2 : 1, draftId: typeof saved.draftId === 'string' ? saved.draftId : null, savedAt: saved.savedAt };
  } catch { return null }
}
export function writeLaunchProgress(form, step, draftId) {
  try {
    const started = Object.keys(blankLaunch).some(k => form[k] !== blankLaunch[k]) || form.image || form.metadataUri || form.devBuy;
    if (!started) { localStorage.removeItem(progressKey); return }
    const stored = { ...form };
    if (typeof stored.image === 'string' && !stored.image.startsWith('https://')) delete stored.image;
    localStorage.setItem(progressKey, JSON.stringify({ form: stored, step, draftId, savedAt: new Date().toISOString() }));
  } catch {}
}
export function clearLaunchProgress() { try { localStorage.removeItem(progressKey) } catch {} }

// Read the image's pixel size so we can warn about non-square or very small images before upload.
export function readImageSize(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// The indexer records token.launched events a few seconds after confirmation. Match on the final transaction hash.
export async function findLaunchedToken(endpoint, { chain, wallet, hash }, { attempts = 10, delayMs = 3000, signal } = {}) {
  const chainId = chain === 'Base' ? 'base' : 'rhc';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) return null;
    try {
      const result = await getEvents(endpoint, { chain: chainId, wallet, types: ['token.launched'], limit: 20 });
      const event = (result.events || []).find(e => e.transactionHash?.toLowerCase() === hash.toLowerCase());
      const token = event?.payload?.args?.token || event?.payload?.args?.tokenAddress;
      if (typeof token === 'string' && /^0x[a-fA-F0-9]{40}$/.test(token)) return token;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}

export function launchChecks({ form, wallet, walletOk, image, quote, build, statuses, step }) {
  const details = Boolean(form.name.trim()) && /^[A-Za-z0-9]{1,10}$/.test(form.symbol);
  const imageDone = /^(ipfs:\/\/|https:\/\/)/i.test((form.metadataUri || '').trim());
  const signed = statuses.length > 0 && statuses.every(s => s.status === 'confirmed');
  const items = [
    ['Details', details, 'Name and ticker'],
    ['Image', imageDone, image.status === 'uploading' ? 'Uploading…' : image.status === 'failed' ? 'Upload failed' : imageDone ? 'Published' : 'Not uploaded'],
    ['Network & venue', step === 2 && details, `${form.chain} · ${form.venue}`],
    ['Wallet', walletOk, walletOk ? shortHash(wallet) : wallet ? `Not valid for ${form.chain}` : 'Not connected'],
    ['Quote', Boolean(quote), quote ? `Expires ${new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not requested'],
    ['Sign', signed, build ? `${build.payloads.length} to sign` : 'After quote'],
  ];
  const active = items.findIndex(([, done]) => !done);
  return items.map(([label, done, detail], i) => ({ label, done, detail, active: i === active }));
}

export function LaunchProgress({ checks }) {
  return <ol className="lp-progress" aria-label="Launch progress">{checks.map((c, i) =>
    <li key={c.label} className={c.done ? 'is-done' : c.active ? 'is-active' : ''} aria-current={c.active ? 'step' : undefined}>
      <b aria-hidden="true">{c.done ? '✓' : i + 1}</b>
      <span><strong>{c.label}</strong><small>{c.detail}</small></span>
      <span className="lp-visually-hidden">{c.done ? 'complete' : c.active ? 'current step' : 'not started'}</span>
    </li>)}</ol>;
}

export function ImageField({ form, upload, canUpload, onChoose, onRetry, onConnect, Icon }) {
  const busy = upload.status === 'reading' || upload.status === 'uploading';
  const pct = Math.round((upload.progress || 0) * 100);
  return <div className="lp-field lp-image-field">
    <label htmlFor="lp-image-input">Image</label>
    <div className="lp-image-row">
      <span className={'lp-upload-icon ' + (busy ? 'is-busy' : '')}>{form.image ? <img src={form.image} alt="Selected token" /> : <Icon name="image" />}</span>
      <div className="lp-image-body">
        <ul className="lp-image-rules">
          <li>PNG, JPG, GIF or WebP</li>
          <li>Up to 2 MB</li>
          <li>Square, 512 × 512 px or larger looks best</li>
        </ul>
        {canUpload
          ? <label className={'lp-secondary lp-file ' + (busy ? 'is-disabled' : '')}>{busy ? 'Uploading…' : form.image ? 'Replace image' : 'Choose image'}<input id="lp-image-input" type="file" accept={imageTypes.join(',')} onChange={onChoose} disabled={busy} /></label>
          : <button type="button" className="lp-secondary" onClick={onConnect}>Connect wallet to upload</button>}
      </div>
    </div>
    {upload.status !== 'idle' && <div className={'lp-upload-status is-' + upload.status} role={upload.status === 'failed' ? 'alert' : 'status'} aria-live="polite">
      {upload.file && <span className="lp-upload-file">{upload.file.name} · {formatBytes(upload.file.size)}{upload.size ? ` · ${upload.size.width} × ${upload.size.height}px` : ''}</span>}
      {upload.status === 'reading' && <span>Reading image…</span>}
      {upload.status === 'uploading' && <><span className="lp-upload-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct} aria-label="Upload progress"><i style={{ width: `${Math.max(4, pct)}%` }} /></span><span>{pct >= 100 ? 'Processing on Slipway storage…' : `Uploading ${pct}%`}</span></>}
      {upload.status === 'done' && <span>Uploaded. The published image URL is filled in for the launch.</span>}
      {upload.status === 'failed' && <><span>{upload.error || 'Could not upload the image.'}</span>{upload.dataUrl && <button type="button" className="lp-text-button" onClick={onRetry}>Retry upload</button>}</>}
      {upload.warning && upload.status !== 'failed' && <span className="lp-upload-warning">{upload.warning}</span>}
    </div>}
    {!canUpload && <small>Uploads are tied to your wallet workspace, so connect a wallet first. You can also paste a public image URL in launch settings.</small>}
  </div>;
}

export function DraftResume({ restored, onStartOver }) {
  if (!restored) return null;
  return <div className="lp-resume" role="status">
    <span>{restored.draftId ? 'Editing a saved draft.' : 'Picked up your unfinished launch'}{restored.savedAt && !restored.draftId ? ` from ${new Date(restored.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}</span>
    <button type="button" className="lp-text-button" onClick={onStartOver}>Start over</button>
  </div>;
}

export function LaunchConfirmed({ launch, onWatch, onTrade, onWorkspace, onAnother, onDone }) {
  const [copied, setCopied] = useState('');
  const copy = async (value, label) => { try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(''), 1600) } catch {} };
  return <>
    <h2 id="launch-response-title">{launch.symbol ? `$${launch.symbol} is live` : 'Launch confirmed'}</h2>
    <p className="lp-picker-copy">{launch.name ? `${launch.name} was` : 'Your token was'} created on {launch.chain}{launch.venue ? ` through ${launch.venue}` : ''}.</p>
    <dl className="lp-confirmed-list">
      <div><dt>Token address</dt><dd>{launch.token
        ? <><code>{launch.token}</code><span className="lp-confirmed-links"><button type="button" className="lp-text-button" onClick={() => copy(launch.token, 'token')}>{copied === 'token' ? 'Copied' : 'Copy'}</button><a className="lp-text-button" href={explorerUrl(launch.chain, 'token', launch.token)} target="_blank" rel="noreferrer">Explorer ↗</a></span></>
        : launch.lookup === 'searching' ? <span role="status">Finding the token address… this takes a few seconds after confirmation.</span>
          : <span>Not indexed yet. It will appear under Launches in your workspace; the transaction below has the address too.</span>}</dd></div>
      <div><dt>Transaction</dt><dd><code>{launch.hash}</code><span className="lp-confirmed-links"><button type="button" className="lp-text-button" onClick={() => copy(launch.hash, 'hash')}>{copied === 'hash' ? 'Copied' : 'Copy'}</button><a className="lp-text-button" href={explorerUrl(launch.chain, 'tx', launch.hash)} target="_blank" rel="noreferrer">View transaction ↗</a></span></dd></div>
    </dl>
    <p className="lp-confirmed-next">Next steps</p>
    <div className="lp-response-actions lp-confirmed-actions">
      {launch.token && <button type="button" className="lp-secondary" onClick={onWatch} disabled={launch.watched}>{launch.watched ? 'On your watchlist' : 'Add to watchlist'}</button>}
      <button type="button" className="lp-secondary" onClick={onTrade}>Open trade</button>
      <button type="button" className="lp-secondary" onClick={onWorkspace}>View in workspace</button>
      <button type="button" className="lp-secondary" onClick={onAnother}>Launch another</button>
      <button type="button" className="lp-primary" onClick={onDone}>Done</button>
    </div>
  </>;
}
