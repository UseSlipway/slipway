import Photo from './Photo';
import React, {useEffect, useRef, useState} from 'react';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useSeen(threshold = .5) {
  const ref = useRef(null), [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reducedMotion()) { setSeen(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= threshold)) { setSeen(true); observer.disconnect(); }
    }, {threshold});
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, seen];
}

// The reference's character reveal: 10ms stagger, 200ms accent hold,
// then a 300ms fade to the final ink. Words stay intact while wrapping.
export function Ink({text, as: Tag = 'h2', className = '', scroll = false, problem = false}) {
  const [ref, seen] = useSeen(.5);
  useEffect(() => {
    if (!scroll || !ref.current || reducedMotion()) return;
    const node = ref.current, chars = [...node.querySelectorAll('.k-char')];
    let frame, previous = -1;
    const render = () => {
      const box = node.getBoundingClientRect(), vh = innerHeight;
      const phoneProblem=problem&&innerWidth<810,start=phoneProblem?1:.9,range=phoneProblem?.2:.3;
      const progress = Math.max(0, Math.min(1, (vh * start - box.top) / (box.height + vh * range)));
      const count = Math.floor(progress * chars.length);
      if (count !== previous) {
        chars.forEach((char, index) => char.classList.toggle('inked', index < count));
        previous = count;
      }
    };
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
    addEventListener('scroll', update, {passive: true}); addEventListener('resize', update); render();
    return () => { removeEventListener('scroll', update); removeEventListener('resize', update); cancelAnimationFrame(frame); };
  }, [scroll, text, problem]);
  let index = 0;
  return <Tag ref={ref} className={`k-ink ${scroll ? 'k-scrub' : seen ? 'k-seen' : ''} ${className}`} aria-label={text.replaceAll('\n', ' ')}>
    <span aria-hidden="true">{text.split('\n').map((line, l) => <React.Fragment key={l}>{l > 0 && <br/>}{line.split(' ').map((word, w) => <React.Fragment key={w}>{w > 0 && ' '}<span className="k-word">{[...word].map(char => <span className="k-char" key={index} style={{'--i': index++}}>{char}</span>)}</span></React.Fragment>)}</React.Fragment>)}</span>
  </Tag>;
}

const scrambleGlyphs='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
export function Label({n,children}){
 const[ref,seen]=useSeen(.5),text=String(children),[display,setDisplay]=useState([...text].map(char=>({char,settled:true})));
 useEffect(()=>{
  if(!seen||reducedMotion())return;
  const chars=[...text],duration=2000,speed=100,scrambleWindow=duration*.2,interval=duration/chars.length;let step=0,timer;
  const tick=()=>{if(step>=duration/speed){setDisplay(chars.map(char=>({char,settled:true})));return;}
   const time=step++*speed;setDisplay(chars.map((char,i)=>{const start=i*interval,settled=time>=start+scrambleWindow;return{char:time<start?'':settled||char===' '?char:scrambleGlyphs[Math.floor(Math.random()*scrambleGlyphs.length)],settled}}));timer=setTimeout(tick,speed/3);
  };tick();return()=>clearTimeout(timer);
 },[seen,text]);
 return <div ref={ref} className="k-label" aria-label={`[${n}] ${text}`}><span aria-hidden="true">[{n}] {display.map(({char,settled},i)=><span key={i} style={{color:settled?'inherit':'var(--k-accent)',transition:'color .1s ease'}}>{char}</span>)}_</span></div>;
}

export function WipeImage({name, alt, className = '', eager = false, sizes}) {
  const [ref, seen] = useSeen(.15);
  return <figure ref={ref} className={`k-image ${seen ? 'k-seen' : ''} ${className}`}><span className="k-image-mask"/><Photo name={name} alt={alt} eager={eager} sizes={sizes}/></figure>;
}

export function Fade({children, className = '', delay = 0}) {
  const [ref, seen] = useSeen(.15);
  return <div ref={ref} className={`k-fade ${seen ? 'k-seen' : ''} ${className}`} style={{'--delay': `${delay}s`}}>{children}</div>;
}

export function WordQuote({text}) {
  const [ref, seen] = useSeen(.5);
  return <blockquote ref={ref} className={`k-word-quote ${seen?'k-seen':''}`} aria-label={text}><span aria-hidden="true">{text.split(' ').map((word,i)=><React.Fragment key={i}>{i>0&&' '}<span style={{'--i':i}}>{word}</span></React.Fragment>)}</span></blockquote>;
}

export function PriceDecode({value}){
 const [ref,seen]=useSeen(.5),text=`$${Number(value).toLocaleString('en-US')}`,[display,setDisplay]=useState([...text].map(char=>({char,active:false})));
 useEffect(()=>{
  const chars=[...text];if(!seen||reducedMotion()){setDisplay(chars.map(char=>({char,active:false})));return;}
  const speed=35,duration=1500,groups=3+Math.floor(Math.random()*2),parts=Math.ceil(chars.length/groups)*2,spacing=duration/parts;
  const bursts=chars.map(()=>Array.from({length:2+Math.floor(Math.random()*2)},()=>{const start=Math.floor(Math.random()*parts)*spacing+Math.random()*spacing*.3;return{start,end:start+150+Math.random()*150}}));
  const end=Math.max(...bursts.flat().map(b=>b.end));let step=0,timer;
  const tick=()=>{const time=step++*speed;if(time>=end){setDisplay(chars.map(char=>({char,active:false})));return;}setDisplay(chars.map((char,i)=>{const active=bursts[i].some(b=>time>=b.start&&time<b.end);return{active,char:active?scrambleGlyphs[Math.floor(Math.random()*scrambleGlyphs.length)]:char}}));timer=setTimeout(tick,speed/2)};tick();return()=>clearTimeout(timer);
 },[text,seen]);
 return <span ref={ref} aria-label={text}><span aria-hidden="true">{display.map(({char,active},i)=><span key={i} style={{color:active?'var(--k-accent)':'inherit',transition:'color .1s ease'}}>{char}</span>)}</span></span>;
}

export function NumberRoll({value, prefix = '', suffix = '', className = ''}) {
  const [ref, seen] = useSeen(.5), [display, setDisplay] = useState(value);
  useEffect(() => {
    if (!seen || reducedMotion()) { setDisplay(value); return; }
    let frame, start;
    const paint = t => {
      start ??= t;
      const p = Math.min((t - start) / 750, 1);
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [seen, value]);
  return <span ref={ref} className={className} aria-label={`${prefix}${value}${suffix}`}><span aria-hidden="true">{prefix}{display.toLocaleString()}{suffix}</span></span>;
}
