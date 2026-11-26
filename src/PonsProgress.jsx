import React from 'react';
import './pons-progress.css';

export function PonsProgress({ value, compact = false }) {
  if (value?.status !== 'active') return null;
  const percent = Math.min(100, Math.max(0, Number(value.progressPercent)));
  const amount = `${value.raised} / ${value.threshold} ${value.quoteAsset}`;
  return <div className={`pons-progress${compact ? ' compact' : ''}`} aria-label={`${percent.toFixed(2)} percent to Pons graduation`}>
    <div className="pons-progress-label"><strong>{percent.toFixed(2)}% to graduation</strong><span>{amount}</span></div>
    <div className="pons-progress-track" role="progressbar" aria-label="Pons graduation progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
      <i style={{ width: `${percent}%` }} />
    </div>
  </div>;
}

export default PonsProgress;
