import {mkdir,copyFile,readFile} from 'node:fs/promises';
// Every SPA route needs its own index.html so direct loads and crawlers get the app instead of a host 404.
// Routes come from the `routes` table in src/App.jsx, so new pages are covered automatically.
const app=await readFile('src/App.jsx','utf8');
const table=app.match(/export const routes=\[(.*?)\];/s)?.[1]||'';
const routes=[...table.matchAll(/\['[^']*','\/([a-z0-9-]+)'\]/g)].map(m=>m[1]);
for(const required of ['dashboard','whitepaper','roadmap','docs']) if(!routes.includes(required)) throw new Error(`postbuild: could not read route "${required}" from src/App.jsx`);
for(const route of new Set([...routes,'platform'])){await mkdir(`dist/${route}`,{recursive:true});await copyFile('dist/index.html',`dist/${route}/index.html`)}
console.log(`postbuild: wrote index.html for ${[...new Set([...routes,'platform'])].join(', ')}`);
