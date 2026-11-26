import React from 'react';
import images from './data/image-manifest.json';
export default function Photo({name,alt='',sizes='(max-width: 809px) 100vw, 50vw',eager=false,...props}){
 const info=images[name];
 return <img {...props} src={`/assets/responsive/${name}-${info.widths.at(-1)}.webp`} srcSet={info.widths.map(w=>`/assets/responsive/${name}-${w}.webp ${w}w`).join(', ')} sizes={sizes} width={info.width} height={info.height} alt={alt} loading={eager?'eager':'lazy'} decoding="async" fetchPriority={eager?'high':'auto'}/>;
}
