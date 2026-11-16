import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: HomePage });

const chains = ["Solana", "Robinhood Chain", "Base", "BNB Chain"];

function HomePage() {
  return (
    <main className="page-shell">
      <nav className="topbar"><a className="wordmark" href="/">slipway<span>®</span></a><a className="nav-link" href="https://github.com/UseSlipway/slipway">GitHub ↗</a></nav>
      <section className="hero">
        <p className="eyebrow"><span className="status-dot" /> OPEN EXECUTION RAILS FOR ONCHAIN LAUNCHES</p>
        <h1>Build once.<br /><em>Launch anywhere.</em></h1>
        <p className="intro">One API, SDK and MCP server for launching and trading across major onchain venues. Every write returns an unsigned transaction for your wallet to sign.</p>
        <div className="actions"><a className="button button-primary" href="https://github.com/UseSlipway/slipway">Read the docs <span>↗</span></a><a className="button button-quiet" href="#how-it-works">How it works <span>↓</span></a></div>
        <div className="terminal" aria-label="Example unsigned transaction response"><div className="terminal-bar"><span /><span /><span /><b>slipway · transaction builder</b></div><pre><code><i>$</i> slipway build trade --token 7xKX...pump<br /><small>venue</small>     pump.fun · bonding curve<br /><small>quote</small>     12,480.52 tokens · 0.23% impact<br /><small>fees</small>      venue 1.00% · slipway 0.20%<br /><small>signing</small>   unsigned transaction ready<br /><small>key access</small> none</code></pre></div>
      </section>
      <section className="chain-strip" aria-label="Supported chains"><span>ONE INTERFACE</span>{chains.map((chain) => <b key={chain}>{chain}</b>)}</section>
      <section className="details" id="how-it-works"><div><p className="eyebrow">THE ROUTE IS YOURS</p><h2>Your wallet.<br />Your signature.</h2></div><p>Slipway resolves the venue, normalizes the curve quote, and builds the transaction. Sign and submit from your own wallet. Keys stay with you.</p></section>
      <footer><a className="wordmark" href="/">slipway<span>®</span></a><span>OPEN EXECUTION INFRASTRUCTURE · PREVIEW</span><span>© 2026 Slipway</span></footer>
    </main>
  );
}
