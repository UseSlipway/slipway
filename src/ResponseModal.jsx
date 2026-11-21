import React from 'react'

export default function ResponseModal({ title, onClose, children }) {
  return <div className="lp-picker-backdrop" onClick={onClose}>
    <section className="lp-picker-modal lp-response-modal" role="dialog" aria-modal="true" aria-labelledby="slipway-response-title" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="lp-picker-close" aria-label="Close dialog" onClick={onClose}>×</button>
      <p className="lp-picker-eyebrow">Slipway</p>
      <h2 id="slipway-response-title">{title}</h2>
      {children}
    </section>
  </div>
}
