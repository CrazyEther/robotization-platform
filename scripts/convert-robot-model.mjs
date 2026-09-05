/** Convert licensed EFEU geometry; serve only model files and the two loader packages on loopback. */
/* global document */
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import console from 'node:console';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep,extname,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import validator from 'gltf-validator';
const roots=['public/models/efeu','node_modules/three','node_modules/urdf-loader'].map(p=>resolve(p));
const html=`<!doctype html><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/":"/node_modules/three/"}}</script><script type="module">
import * as THREE from 'three';import URDFLoader from '/node_modules/urdf-loader/src/URDFLoader.js';import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
try{const manager=new THREE.LoadingManager();let robot;const ready=new Promise((resolve,reject)=>{manager.onLoad=resolve;manager.onError=url=>reject(new Error('Missing model asset: '+url));});new URDFLoader(manager).load('/models/efeu/efeu.urdf',r=>robot=r);await ready;if(!robot)throw new Error('Robot missing');robot.rotation.x=-Math.PI/2;robot.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry.getAttribute('normal')?.count!==o.geometry.getAttribute('position')?.count){o.geometry.deleteAttribute('normal');o.geometry.computeVertexNormals();}});const buffer=await new GLTFExporter().parseAsync(robot,{binary:true});const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));await window.saveModel(btoa(binary));document.body.dataset.complete='true';}catch(e){document.body.dataset.error=String(e);}
</script><body></body>`;
const server=createServer(async(req,res)=>{try{const path=new URL(req.url??'/','http://localhost').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const target=resolve(path.startsWith('/models/')?'public'+decodeURIComponent(path):'.'+decodeURIComponent(path));if(!roots.some(root=>target.startsWith(root+sep))){res.writeHead(404).end();return;}res.setHeader('Content-Type',extname(target)==='.js'?'text/javascript':'application/octet-stream');res.end(await readFile(target));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;const scratch=await mkdtemp(resolve(tmpdir(),'efeu-conversion-'));let browser;
try{browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});const page=await browser.newPage();const intermediate=resolve(scratch,'efeu.glb');await page.exposeFunction('saveModel',async data=>{await writeFile(intermediate,Buffer.from(data,'base64'));});await page.goto('http://127.0.0.1:'+port);await page.waitForFunction(()=>document.body.dataset.complete||document.body.dataset.error,{},{timeout:90000});const error=await page.getAttribute('body','data-error');if(error)throw new Error(error);const input=await readFile(intermediate);const checked=await validator.validateBytes(new Uint8Array(input),{maxIssues:100});if(checked.issues.numErrors)throw new Error(JSON.stringify(checked.issues));
 const packageJson=JSON.parse(await readFile('node_modules/gltfpack/package.json','utf8'));const binary=typeof packageJson.bin==='string'?packageJson.bin:packageJson.bin.gltfpack;const output='public/models/efeu/efeu-web.glb';execFileSync(process.execPath,[resolve('node_modules/gltfpack',binary),'-i',intermediate,'-o',output,'-cc','-noq','-kn','-km'],{stdio:'inherit'});
 const bytes=await readFile(output);const path='public/models/efeu/provenance.json';const manifest=JSON.parse(await readFile(path,'utf8'));manifest.webModel={path:'efeu-web.glb',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,sourceUrdfSha256:manifest.derivedSha256,mapping:'Three.js URDFLoader/GLTFExporter; regenerate invalid normal counts; Z-up to Y-up; gltfpack -cc -noq -kn -km. No position quantization or mesh simplification.',gltfpackVersion:packageJson.version};await writeFile(path,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({status:'passed',inputBytes:input.length,outputBytes:bytes.length,validationErrors:checked.issues.numErrors}));
}finally{await browser?.close();server.close();if(dirname(scratch)===resolve(tmpdir())&&basename(scratch).startsWith('efeu-conversion-'))await rm(scratch,{recursive:true,force:true});}
