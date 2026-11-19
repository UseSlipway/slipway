import React from 'react';
import BrandLogo,{chains} from '../../BrandLogo';
import Photo from '../../Photo';
import { useState } from "react";
import SectionFrame from "../../components/SectionFrame";
import { useInView, useCountUp, fmt } from "../../lib/hooks";
import "./WidgetGridThree.css";

const I = {
  dots: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5.5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="18.5" r="1.7" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" /></svg>,
  chev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m7 10 5 5 5-5" /></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 3.2 2.9 10.4c-.9.35-.87 1.64.05 1.94l4.63 1.5 1.78 5.36c.28.85 1.4 1 1.9.26l2.5-3.66 4.7 3.46c.7.5 1.7.12 1.87-.73l2.6-13.9c.16-.85-.66-1.5-1.43-1.2Z" /></svg>,
  bolt: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 2 5 13.4h5.2L9.8 22l8.7-11.6H13L13.5 2Z" /></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.6h-4.6" /></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5 7.6 20h8.8l1.1-13.5" /></svg>,
};

/* ---------- lollipop series ---------- */
const SALES = [{m:"Resolve",v:38},{m:"Quote",v:64},{m:"Build",v:88},{m:"Sign",v:52},{m:"Submit",v:71},{m:"Verify",v:82}];

function Lollipops({activity,range}) {
  const days=range==="Weekly"?7:30; const points=Array.from({length:6},(_,i)=>{const end=Date.now()-(5-i)*days/6*86400000; const start=end-days/6*86400000;return{m:new Date(end).toLocaleDateString("en-US",{month:"short",day:"numeric"}),v:activity.filter(a=>new Date(a.time).getTime()>start&&new Date(a.time).getTime()<=end).length}}); const max=Math.max(1,...points.map(p=>p.v));
  const [ref, inView] = useInView();
  const [hov, setHov] = useState(null);
  const active = hov ?? 2;

  return (
    <div className="g3-lolli" ref={ref} onMouseLeave={() => setHov(null)}>
      <div className="g3-lolli__plot">
        {points.map((s, i) => (
          <button key={s.m} className="g3-lolli__col" data-active={i === active} onMouseEnter={() => setHov(i)} aria-label={`${s.m}: ${s.v} actions`} onClick={() => setHov(i)} onFocus={() => setHov(i)}>
            <span className="g3-lolli__stem" data-in={inView} style={{ "--h": `${Math.max(3,s.v/max*80)}%`, "--i": i }}>
              <u className="g3-lolli__dot" />
              <span className="g3-lolli__tip" data-show={i === active}>{s.v} actions</span>
            </span>
          </button>
        ))}
      </div>
      <div className="g3-lolli__axis">{points.map((s) => <i key={s.m}>{s.m}</i>)}</div>
    </div>
  );
}

/* ---------- jagged area ---------- */
function Jagged({ tone = "accent", seed = 1 }) {
  const [ref, inView] = useInView();
  const pts = Array.from({ length: 34 }, (_, i) => {
    const n = Math.abs(Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6 + seed));
    return [i / 33 * 200, 46 - n * 40];
  });
  const d = "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");

  return (
    <svg className="g3-jag" data-tone={tone} ref={ref} viewBox="0 0 200 52">
      <path className="g3-jag__line" data-in={inView} d={d} />
    </svg>
  );
}

/* ---------- wavy balance ---------- */
function Wave() {
  const [ref, inView] = useInView();
  return (
    <svg className="g3-wave" ref={ref} viewBox="0 0 260 90">
      <path className="g3-wave__line" data-in={inView}
        d="M4 62 C30 30 46 74 68 52 C92 28 104 70 128 46 C150 24 166 66 190 40 C212 18 232 54 256 34" />
      <circle className="g3-wave__dot" data-in={inView} cx="128" cy="46" r="5" />
    </svg>
  );
}

/* ---------- dot matrix ---------- */
function Matrix({activity}) {
  const [ref, inView] = useInView();
  return (
    <div className="g3-matrix" ref={ref}>
      {Array.from({ length: 24 }, (_, i) => {
        const n = i < Math.min(activity.length,24) ? 1 : .12;
        const tone = n > 0.72 ? "hot" : n > 0.44 ? "warm" : "cool";
        return <span key={i} data-tone={tone} data-in={inView} style={{ "--d": `${i * 22}ms`, "--s": 0.5 + n * 0.5 }} />;
      })}
    </div>
  );
}

function Figure({ value, prefix = "$", dp = 2 }) {
  const [ref, inView] = useInView({ threshold: 0.4 });
  const n = useCountUp(value, { run: inView, duration: 1100 });
  return <b className="ui-num" ref={ref}>{prefix}{n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}</b>;
}

/* ================= section ================= */
export default function WidgetGridThree({workspace, onAction, range}) {
  return (
    <SectionFrame id="widgets-three" background="transparent" theme="light">
      <div className="g3" onClick={e=>{const b=e.target.closest("button"); if(!b)return; const a=b.closest("article"); const h=a?.querySelector("h3")?.textContent; const t=b.textContent; if(b.classList.contains("g3-lolli__col"))return; onAction(b.classList.contains("g3__add")?"launch":b.classList.contains("g3__report")?"export":h==="Your wallet"?"wallet":h==="Activity rhythm"?"range":h==="Quick trade"?(t==="Watch"?"watch":"trade"):h==="Watchlist"?"watch":h==="Launch workspace"?"drafts":h==="Prepared launches"?"drafts":h==="Saved tokens"?"watches":h==="Workspace activity"?"activity":h==="Your settings"?"profile":"fees");}}>
        {/* 1 · profile */}
        <article className="g3__c g3__profile">
          <header><h3>Your wallet</h3><button aria-label="Open widget options" className="g3__ico">{I.dots}</button></header>
          <Photo className="g3__wallet-photo" name="wallet-static" sizes="(max-width: 599px) 100vw, 420px" eager alt="Warm leather wallets on a stone surface" />
        </article>

        {/* 2 · sales */}
        <article className="g3__c g3__sales">
          <header><h3>Activity rhythm</h3><button className="g3__chip">{range} {I.chev}</button></header>
          <Lollipops activity={workspace.activity} range={range}/>
        </article>

        {/* 3 · quick deal */}
        <article className="g3__c g3__deal">
          <header><h3>Quick trade</h3><button aria-label="Open widget options" className="g3__ico">{I.dots}</button></header>
          <ul className="g3__tickers">
            <li><BrandLogo name="solana" label="Solana" className="g3__tk"/>SOLANA<b className="ui-num">SOL</b></li>
            <li><BrandLogo name="base" label="Base" className="g3__tk"/>BASE<b className="ui-num">ETH</b></li>
          </ul>
          <div className="g3__dealBtns">
            <button className="g3__btn" data-v="ghost">Watch</button>
            <button className="g3__btn" data-v="primary">Trade</button>
          </div>
        </article>

        {/* 4 · employees */}
        <article className="g3__c g3__emp">
          <header><h3>Watchlist</h3><button aria-label="Open widget options" className="g3__ico">{I.dots}</button></header>
          <div className="g3__empRow">
            <span className="g3__empMore">{workspace.watches.length}</span>
            <BrandLogo name="solana" label="Solana"/>
            <span className="g3__empName">Your tokens<i>Across chains</i></span>
            <button aria-label="Open widget options" className="g3__ico">{I.edit}</button>
          </div>
          <p className="g3__card ui-num"><i>WATCH</i>PUBLIC ADDRESSES ONLY</p>
          <button className="g3__btn g3__btn--wide" data-v="primary">{I.plus} Watch a token</button>
        </article>

        {/* 5 · businesses */}
        <article className="g3__c g3__biz">
          <header>
            <h3>Launch workspace</h3>
            <span className="g3__bizTools"><button aria-label="Manage widget" className="g3__ico" data-v="accent">{I.edit}</button><button aria-label="Manage widget" className="g3__ico" data-v="accent">{I.trash}</button></span>
          </header>
          <p className="g3__bizFig">Drafts <Figure value={workspace.drafts.length} prefix="" dp={0} /> <em>saved</em></p>
          <span className="g3__track"><i style={{ width: workspace.drafts.length?"100%":"0%" }} /><u style={{ width: "0%" }} /></span>
          <div className="g3__bizRow">
            <span className="g3__bizMark" />
            <span>Your next launch</span>
            <b className="ui-num">Unsigned by design</b>
          </div>
          <span className="g3__dots"><i data-on /><i /><i /></span>
        </article>

        {/* 6 · actions */}
        <div className="g3__stack">
          <button className="g3__add">
            <span>{I.plus}</span>
            Prepare a new launch
          </button>
          <button className="g3__report">
            <span>{I.down}</span>
            Export workspace.json
          </button>
        </div>

        {/* 7 · income */}
        <article className="g3__c g3__flow">
          <header><h3>Prepared launches</h3><button aria-label="Manage widget" className="g3__ico" data-v="accent">%</button></header>
          <div className="widget-empty">{workspace.drafts.length?"Ready for your next step":"Create a launch to get started"}</div>
          <p className="g3__flowFig"><i data-dir="up">▲</i><Figure value={workspace.drafts.length} prefix="" dp={0} /></p>
        </article>

        {/* 8 · expense */}
        <article className="g3__c g3__flow">
          <header><h3>Saved tokens</h3><button aria-label="Open widget options" className="g3__ico">%</button></header>
          <div className="widget-empty">{workspace.watches.length?"Tokens in your watchlist":"Keep track of what matters"}</div>
          <p className="g3__flowFig"><i data-dir="down">▼</i><Figure value={workspace.watches.length} prefix="" dp={0} /></p>
        </article>

        {/* 9 · balance */}
        <article className="g3__c g3__bal">
          <header><h3>Your settings</h3><button aria-label="Open widget options" className="g3__ico">{I.refresh}</button></header>
          <span className="g3__balTag">YOUR CONTROL</span>
          <div className="widget-empty">Slippage {workspace.settings.slippage}%<br/>Integrator fee {workspace.settings.fee} bps</div>
          <p className="g3__balFig">Workspace preferences</p>
        </article>

        {/* 10 · transactions */}
        <article className="g3__c g3__tx">
          <header>
            <h3>Workspace activity</h3>
            <span className="g3__bizTools"><span className="ui-pill" data-tone="accent">{workspace.activity.length}</span><button className="g3__chip">History {I.chev}</button></span>
          </header>
          <div className="g3__txFaces">
            <b className="ui-num">{workspace.activity.length}</b>
            {chains.map(([slug,label])=><BrandLogo key={slug} name={slug} label={label}/>)}
          </div>
          <Matrix activity={workspace.activity}/>
        </article>

        {/* 11 · profit */}
        <article className="g3__c g3__profit">
          <header>
            <h3>Integration surfaces</h3>
            <span className="g3__goal">One consistent workflow</span>
          </header>
          <div className="g3__profitRow">
            <span><i>API</i><b className="ui-num">REST</b></span>
            <span><i>SDK</i><b className="ui-num">TypeScript</b></span>
            <span><i>MCP</i><b className="ui-num">Agents</b></span>
          </div>
          <div className="g3__perf">
            <span data-k="a" /><span data-k="b" /><span data-k="c" />
          </div>
          <div className="g3__net">
            <span className="g3__netIco">{I.down}</span>
            <span>Signing <b className="ui-num">Your wallet</b></span>
            <span className="g3__netWho"><i>S</i>Slipway<em>Execution</em></span>
          </div>
        </article>
      </div>
    </SectionFrame>
  );
}