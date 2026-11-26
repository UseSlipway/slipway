import React,{useEffect,useRef,useState} from 'react';
import images from './data/image-manifest.json';
const warmed=new Map();
const routeNames=path=>path==='/dashboard'?['wallet-static']:path==='/networks'?['network-base']:path==='/developers'?['developer-custody']:path==='/'?['architecture','infrastructure']:[];
function warmImage(name,sizes){const key=name+sizes;if(warmed.has(key))return warmed.get(key);const info=images[name],img=new Image();img.sizes=sizes;img.srcset=info.widths.map(w=>`/assets/responsive/${name}-${w}.webp ${w}w`).join(', ');img.src=`/assets/responsive/${name}-${info.widths.at(-1)}.webp`;const task=img.decode().catch(()=>{});warmed.set(key,task);return task}
export function warmRoute(to){const path=new URL(to,location.href).pathname;const imagesReady=routeNames(path).map(n=>warmImage(n,path==='/dashboard'?'(max-width: 599px) 100vw, 420px':path==='/networks'?'(max-width: 760px) 100vw, 70vw':'(max-width: 809px) 100vw, 50vw'));const routeReady=path==='/dashboard'?import('./WalletLaunchpad').catch(()=>{}):Promise.resolve();return Promise.all([...imagesReady,routeReady])}
export default function PageAssets({path,children,onReady}){
 const root=useRef(),[ready,setReady]=useState(false),[progress,setProgress]=useState(0);
 useEffect(()=>{
  let disposed=false,done=0;
  const nodes=[...root.current.querySelectorAll('img[loading="eager"]')];
  const fontReady=path==='/'?document.fonts.load('800 16px "TASA Orbiter"'):Promise.resolve();
  const tasks=[...nodes.map(img=>img.decode().catch(()=>{})),fontReady];
  const frame=root.current.querySelector('iframe');
  let onFrame;
  if(frame)tasks.push(new Promise(resolve=>{
   onFrame=()=>{const doc=frame.contentDocument;if(doc?.documentElement.dataset.assetsReady==='true')resolve();else frame.contentWindow?.addEventListener('platform-ready',resolve,{once:true})};
   frame.addEventListener('load',onFrame,{once:true});
   if(frame.contentDocument?.documentElement.dataset.assetsReady==='true')resolve();
  }));
  Promise.all(tasks.map(task=>Promise.resolve(task).finally(()=>{done++;if(!disposed)setProgress(Math.round(done/tasks.length*100))}))).then(()=>{if(!disposed){setReady(true);onReady?.()}});
  return()=>{disposed=true;if(frame&&onFrame)frame.removeEventListener('load',onFrame)};
 },[path]);
 return <><div ref={root} className="page-content" data-ready={ready} aria-busy={!ready}>{children(ready)}</div>{!ready&&<div className="preloader asset-preloader" role="status" aria-label="Loading Slipway"><div><p><span>SLIPWAY</span><span>{progress}%</span></p><i role="progressbar" aria-label="Loading page assets" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><b style={{width:progress+'%'}}/></i></div></div>}</>;
}
