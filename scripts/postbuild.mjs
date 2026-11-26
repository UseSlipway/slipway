import {mkdir,copyFile} from 'node:fs/promises';
for(const route of ['platform','dashboard','developers','networks','whitepaper','roadmap']){await mkdir(`dist/${route}`,{recursive:true});await copyFile('dist/index.html',`dist/${route}/index.html`)}
