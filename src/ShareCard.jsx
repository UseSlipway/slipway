import React, { useEffect, useRef, useState } from 'react';
import { fetchJSON, unpack } from './MarketBoard';

const W = 1200, H = 630;
const slug = { 'Robinhood Chain': 'rhc', Base: 'base', 'SPCX Chain': 'spcx' };
const network = { rhc: 'robinhood', base: 'base' };
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';

// Shareable link that opens a token page directly: /dashboard?token=rhc:0x…
export function tokenLink(chain, token, origin = globalThis.location?.origin || 'https://tryslipway.com') {
  const id = slug[chain] || chain;
  return `${origin}/dashboard?token=${id}:${token}`;
}

export function parseTokenParam(value) {
  const match = /^(rhc|base|spcx):(0x[a-fA-F0-9]{40})$/.exec(value || '');
  return match ? { chain: match[1], token: match[2] } : null;
}

// Find the deepest pool for a token so a shared link can open its page.
export async function findPoolForToken(endpoint, chain, token) {
  if (!network[chain]) return null;
  const params = new URLSearchParams({ query: token, network: network[chain], include: 'base_token,quote_token' });
  const json = await fetchJSON(endpoint, `search/pools?${params}`);
  const rows = unpack(json, network[chain]).filter(r => String(r.token).toLowerCase() === token.toLowerCase());
  return rows.sort((a, b) => (Number(b.liquidity) || 0) - (Number(a.liquidity) || 0))[0] || null;
}

export function shareText({ symbol, name, chain, launched }) {
  return launched
    ? `$${symbol} just launched on Slipway${chain ? ` (${chain})` : ''}.\n\n${name ? `${name}. ` : ''}Trade it, chart it, watch it graduate:`
    : `$${symbol}${chain ? ` on ${chain}` : ''}: live chart, trades and creator history on Slipway:`;
}

function loadImage(src, cross = true) {
  return new Promise(resolve => {
    if (!src) { resolve(null); return }
    const img = new Image();
    if (cross) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

async function drawCard(canvas, { name, symbol, chain, venue, token, image, stats = [], launched }) {
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  try { await document.fonts?.ready } catch {}
  const sans = '"Inter Tight Variable","Inter Variable",Inter,system-ui,sans-serif';
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2a0d17'); bg.addColorStop(1, '#100609');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(980, 120, 20, 980, 120, 520);
  glow.addColorStop(0, 'rgba(216,181,104,.28)'); glow.addColorStop(1, 'rgba(216,181,104,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // Token image (CORS-safe) or initials.
  const [tokenImg, logo] = await Promise.all([loadImage(image), loadImage('/assets/logo.png', false)]);
  ctx.save(); roundRect(ctx, 72, 150, 220, 220, 44); ctx.clip();
  if (tokenImg) ctx.drawImage(tokenImg, 72, 150, 220, 220);
  else { const g = ctx.createLinearGradient(72, 150, 292, 370); g.addColorStop(0, '#e4cb97'); g.addColorStop(1, '#9a693b'); ctx.fillStyle = g; ctx.fillRect(72, 150, 220, 220); ctx.fillStyle = '#342017'; ctx.font = `800 92px ${sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((symbol || '?').slice(0, 2).toUpperCase(), 182, 262); }
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#d8b568'; ctx.font = `700 24px ${sans}`;
  ctx.fillText(launched ? 'JUST LAUNCHED ON SLIPWAY' : 'ON SLIPWAY', 340, 190);
  ctx.fillStyle = '#f0e7db'; ctx.font = `800 ${(symbol || '').length > 8 ? 84 : 108}px ${sans}`;
  ctx.fillText(`$${(symbol || '').toUpperCase()}`, 334, 300);
  ctx.fillStyle = 'rgba(240,231,219,.78)'; ctx.font = `600 34px ${sans}`;
  const title = (name || '').length > 34 ? `${name.slice(0, 33)}…` : (name || '');
  ctx.fillText(title, 340, 352);

  ctx.font = `600 26px ${sans}`; ctx.fillStyle = 'rgba(240,231,219,.62)';
  ctx.fillText([chain, venue].filter(Boolean).join('  ·  '), 72, 452);
  ctx.font = `500 26px "Roboto Mono Variable","Roboto Mono",ui-monospace,monospace`;
  ctx.fillText(short(token), 72, 494);

  let x = 600;
  for (const [label, value] of stats.slice(0, 3)) {
    ctx.fillStyle = 'rgba(240,231,219,.55)'; ctx.font = `600 20px ${sans}`; ctx.fillText(label.toUpperCase(), x, 452);
    ctx.fillStyle = '#f0e7db'; ctx.font = `700 34px ${sans}`; ctx.fillText(value, x, 494); x += 200;
  }

  ctx.fillStyle = 'rgba(240,231,219,.14)'; ctx.fillRect(72, 548, W - 144, 1);
  if (logo) ctx.drawImage(logo, 72, 566, 36, 36);
  ctx.fillStyle = '#f0e7db'; ctx.font = `700 26px ${sans}`; ctx.fillText('Slipway', logo ? 120 : 72, 594);
  ctx.textAlign = 'right'; ctx.fillStyle = '#d8b568'; ctx.font = `600 24px ${sans}`; ctx.fillText('tryslipway.com', W - 72, 594);
}

export default function ShareCard(props) {
  const canvas = useRef();
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState('');
  const { symbol, chain, token } = props;
  const link = token ? tokenLink(chain, token) : 'https://tryslipway.com';
  useEffect(() => { setReady(false); drawCard(canvas.current, props).then(() => setReady(true)).catch(() => setReady(true)) }, [props.name, symbol, chain, token, props.image, JSON.stringify(props.stats)]);

  const blob = () => new Promise(resolve => canvas.current.toBlob(resolve, 'image/png'));
  const flash = text => { setNote(text); setTimeout(() => setNote(''), 2200) };
  async function download() {
    const file = await blob(); if (!file) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = `${(symbol || 'token').toLowerCase()}-slipway.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function copyImage() {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob() })]); flash('Image copied. Paste it into your post.') }
    catch { flash('Copying images is not supported here. Use Download instead.') }
  }
  async function copyLink() { try { await navigator.clipboard.writeText(link); flash('Link copied.') } catch { flash(link) } }
  async function nativeShare() {
    try {
      const file = await blob();
      const files = file ? [new File([file], `${(symbol || 'token').toLowerCase()}-slipway.png`, { type: 'image/png' })] : [];
      await navigator.share({ text: shareText(props), url: link, ...(files.length && navigator.canShare?.({ files }) ? { files } : {}) });
    } catch {}
  }
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(shareText(props))}&url=${encodeURIComponent(link)}`;

  return <div className="share-card">
    <canvas ref={canvas} className="share-card-canvas" width={W} height={H} role="img" aria-label={`Share card for $${symbol}`} />
    <div className="share-card-actions">
      <a className="lp-primary" href={intent} target="_blank" rel="noreferrer" onClick={download}>Post on X</a>
      <button type="button" className="lp-secondary" onClick={copyImage} disabled={!ready}>Copy image</button>
      <button type="button" className="lp-secondary" onClick={download} disabled={!ready}>Download</button>
      <button type="button" className="lp-secondary" onClick={copyLink}>Copy link</button>
      {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="lp-secondary" onClick={nativeShare}>Share…</button>}
    </div>
    <p className="share-card-note" role="status">{note || 'Post on X opens your post and downloads the image so you can attach it.'}</p>
  </div>;
}
