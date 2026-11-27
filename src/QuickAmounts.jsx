import React from 'react';

// One-tap trade amounts. Buys use saved presets per quote asset; sells use a share of the wallet balance.
export const defaultQuickBuy = { ETH: [0.01, 0.05, 0.1], USD: [10, 50, 100], SPCX: [100, 500, 1000] };

export function presetGroup(asset) {
  const a = String(asset || '').toUpperCase();
  if (a === 'ETH' || a === 'WETH') return 'ETH';
  if (a === 'USDC' || a === 'USDG' || a === 'USDT') return 'USD';
  if (a === 'SPCX' || a === 'WSPCX') return 'SPCX';
  return null;
}

export function parsePresets(text) {
  const values = String(text || '').split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n) && n > 0);
  return [...new Set(values)].sort((a, b) => a - b).slice(0, 4);
}

export function presetsFor(asset, settings) {
  const group = presetGroup(asset);
  if (!group) return [];
  const saved = settings?.quickBuy?.[group];
  return Array.isArray(saved) && saved.length ? saved : defaultQuickBuy[group];
}

// Share of a balance as a plain decimal string, rounded down so the amount never exceeds the balance.
export function shareOfBalance(balance, share) {
  const value = Number(balance);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (share >= 1) return String(balance);
  const digits = value >= 1 ? 6 : 10;
  const factor = 10 ** digits;
  return String(Math.floor(value * share * factor) / factor);
}

export default function QuickAmounts({ side, asset, settings, balance, onPick }) {
  if (side === 'Sell') {
    if (!(Number(balance) > 0)) return null;
    return <div className="quick-amounts" role="group" aria-label="Quick sell amounts">
      {[[0.25, '25%'], [0.5, '50%'], [1, 'Max']].map(([share, label]) =>
        <button key={label} type="button" onClick={() => onPick(shareOfBalance(balance, share))}>{label}</button>)}
    </div>;
  }
  const presets = presetsFor(asset, settings);
  if (!presets.length) return null;
  return <div className="quick-amounts" role="group" aria-label="Quick buy amounts">
    {presets.map(value => <button key={value} type="button" onClick={() => onPick(String(value))}>{value} {asset}</button>)}
  </div>;
}
