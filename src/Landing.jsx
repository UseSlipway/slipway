import React,{useEffect,useRef,useState}from'react';import{Link,Footer}from'./App';
import {Introduction,Problems,Calculator,Services,Process,Feature,Principles,Integrations,Audiences,Pricing,FAQ,Articles,Closing} from './KymaSections';
import Photo from './Photo';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
const photos=[['architecture','An open foundation'],['infrastructure','One integration'],['network','Every route'],['precision','Explicit by design'],['multichain','Across supported chains'],['trading','Launch. Buy. Sell.'],['launch','From first launch']];
function Orbit(){
 const root=useRef(),els=useRef([]);
 useEffect(()=>{
  const node=root.current,media=matchMedia('(prefers-reduced-motion: reduce)');
  let raf=0,last=performance.now(),offset=0,scroll=window.scrollY,smoothed=0,velocity=0,visible=true,w=node.clientWidth,h=node.clientHeight;
  const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
  const paint=t=>{
   const cw=w<810?96:w<1200?148:180,ch=cw*.75,loop=w+2*cw,dt=Math.min((t-last)/1000,.064);last=t;
   offset+=media.matches?0:(w<810?15:25)*dt+(window.scrollY-scroll)*.75;scroll=window.scrollY;
   for(let k=0;k<3;k++){velocity+=(55*(offset-smoothed)-24*velocity)*(dt/3);smoothed+=velocity*(dt/3)}
   els.current.forEach((el,i)=>{if(!el)return;const x=((i*loop/7+noise(i*5.3)*loop/7*.35+smoothed)%loop+loop)%loop-cw,f=.5*(1+Math.cos(Math.PI*Math.min(Math.abs((x+cw/2-w/2)/(w/2)),1))),y=h/2+(i%2===0?-1:1)*f*.75*h/2*(.8+noise(i*2.17)*.35)-ch/2;el.style.width=cw+'px';el.style.height=ch+'px';el.style.transform=`translate3d(${x}px,${y}px,0) scale(${1+f*.4})`});
   if(!media.matches&&visible&&!document.hidden)raf=requestAnimationFrame(paint);
  };
  const resume=()=>{cancelAnimationFrame(raf);last=performance.now();scroll=window.scrollY;if(visible&&!document.hidden)raf=requestAnimationFrame(paint)};
  const resize=new ResizeObserver(()=>{w=node.clientWidth;h=node.clientHeight;resume()});resize.observe(node);
  const observe=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;node.dataset.motion=visible&&!document.hidden&&!media.matches?'running':'paused';resume()});observe.observe(node);
  document.addEventListener('visibilitychange',resume);media.addEventListener('change',resume);resume();
  return()=>{cancelAnimationFrame(raf);resize.disconnect();observe.disconnect();document.removeEventListener('visibilitychange',resume);media.removeEventListener('change',resume)};
 },[]);
 return <div className="orbit" ref={root}>{photos.map(([p,n],i)=><Link to={i===5?'/dashboard':'/networks'} key={p} className="orbit-card"><div ref={e=>els.current[i]=e} className="orbit-photo"><Photo name={p} sizes="260px" eager alt={n}/><span>{n}<small>SLIPWAY</small></span></div></Link>)}</div>;
}
export default function Landing({ready=false}){
 useEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const lenis=new Lenis({duration:1.2,smoothWheel:true,autoRaf:true,anchors:true,allowNestedScroll:true});const jump=()=>{const target=document.getElementById(location.hash.slice(1));if(target){lenis.resize();lenis.scrollTo(target,{immediate:true,force:true})}};let disposed=false,settledFrame;const hashFrame=requestAnimationFrame(jump);const settle=()=>document.fonts.ready.then(()=>{if(!disposed)settledFrame=requestAnimationFrame(jump)});if(document.readyState==='complete')settle();else addEventListener('load',settle,{once:true});addEventListener('hashchange',jump);const menu=e=>e.detail?lenis.stop():lenis.start();const stop=()=>lenis.stop();addEventListener('menu-state',menu);addEventListener('navigate',stop);return()=>{removeEventListener('menu-state',menu);removeEventListener('navigate',stop);removeEventListener('hashchange',jump);disposed=true;removeEventListener('load',settle);cancelAnimationFrame(hashFrame);cancelAnimationFrame(settledFrame);lenis.destroy()}},[]);
 const loaded=ready;
 return <main className="landing kyma-landing">
 <section className={'caspia-hero '+(loaded?'entered':'')}><Orbit/><div className="hero-copy"><h1 aria-label="SLIPWAY">{'SLIPWAY'.split('').map((c,i)=><span key={i}><b style={{animationDelay:i*.075+'s'}}>{c}</b></span>)}</h1><p>Launch, buy and sell across chains.<br/>One API, one SDK, one MCP. Your wallet signs.</p></div><div className="hero-foot"><span>OPEN EXECUTION INFRASTRUCTURE</span><span>ROBINHOOD CHAIN · BASE · BNB COMING SOON</span><a href="#introduction" className="scroll-hint">SCROLL TO EXPLORE ↓</a></div></section>
 <Introduction/><Problems/><Calculator/><Services/><Process/><Feature/><Principles/><Integrations/><Audiences/><Pricing/><FAQ/><Articles/><Closing/><Footer/>
 </main>
}
