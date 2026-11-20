import React from 'react';
export const chains=[['robinhood','Robinhood Chain'],['base','Base']];
export default function BrandLogo({name,label,className=''}){
 if(name==='pancakeswap')return <img className={`brand-mark ${className}`} src="/assets/brands/pancakeswap-slipway.svg" alt={label||'PancakeSwap'} width="1281" height="198" loading="eager"/>;
 if(['zora','pump-fun'].includes(name))return <img className={`brand-mark brand-orb ${className}`} src={`/assets/brands/${name}.svg`} alt={label||'Zora'} width="100" height="100" loading="eager"/>;
 const src=`/assets/brands/${name}.${name==='bags'?'png':'svg'}`;
 return <span data-asset-src={src} role="img" aria-label={label||name} className={`brand-mark ${className}`} style={{backgroundColor:'currentColor',maskImage:`url("${src}")`,maskSize:'contain',maskRepeat:'no-repeat',maskPosition:'center',WebkitMaskImage:`url("${src}")`,WebkitMaskSize:'contain',WebkitMaskRepeat:'no-repeat',WebkitMaskPosition:'center'}}/>;
}
