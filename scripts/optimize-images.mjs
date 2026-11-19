import sharp from 'sharp';
import {readdir, mkdir, stat, writeFile} from 'node:fs/promises';
const source=new URL('../public/assets/',import.meta.url);
const target=new URL('responsive/',source);
await mkdir(target,{recursive:true});
const files=(await readdir(source)).filter(name=>name.endsWith('.jpg'));
const manifest={};
let originalBytes=0, smallestBytes=0;
for(let i=0;i<files.length;i+=3)await Promise.all(files.slice(i,i+3).map(async file=>{
 const input=new URL(file,source), info=await stat(input), metadata=await sharp(input.pathname).metadata();
 const name=file.slice(0,-4), widths=[...new Set([480,960,1600].map(w=>Math.min(w,metadata.width)))];
 manifest[name]={width:metadata.width,height:metadata.height,widths};originalBytes+=info.size;
 for(const width of widths){
  const output=new URL(`${name}-${width}.webp`,target);
  const cached=await stat(output).catch(()=>null);
  if(!cached||cached.mtimeMs<info.mtimeMs)await sharp(input.pathname).rotate().resize({width,withoutEnlargement:true}).webp({quality:82,effort:5}).toFile(output.pathname);
 }
 const smallest=await stat(new URL(`${name}-${widths[0]}.webp`,target));smallestBytes+=smallest.size;
}));
await mkdir(new URL('../src/data/',import.meta.url),{recursive:true});
await writeFile(new URL('../src/data/image-manifest.json',import.meta.url),JSON.stringify(manifest));
console.log(`${files.length} distinct photographs optimized: originals ${(originalBytes/1e6).toFixed(2)} MB; phone variants ${(smallestBytes/1e6).toFixed(2)} MB.`);
