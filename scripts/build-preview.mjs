/* global process, console */
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const cwd=resolve(import.meta.dirname,'..');
const env={...process.env,VITE_PUBLIC_PREVIEW:'true'};
for(const args of [
 [resolve(cwd,'node_modules','typescript','bin','tsc'),'--noEmit'],
 [resolve(cwd,'node_modules','vite','bin','vite.js'),'build']
]){
 const result=spawnSync(process.execPath,args,{cwd,env,stdio:'inherit'});
 if(result.error)console.error('Preview build failed:',result.error.message);
 if(result.status!==0)process.exit(result.status??1);
}
