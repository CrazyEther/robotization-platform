/* global process, console */
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

const cwd=resolve(import.meta.dirname,'..');
const webPort=Number(process.env.RIS_WEB_PORT??8890);
const env={...process.env,PORT:String(webPort)};
const api=spawn(process.execPath,[resolve(cwd,'node_modules','tsx','dist','cli.mjs'),'apps/api/server.ts'],{cwd,env,stdio:'inherit'});
let stopping=false;
function stop(){if(stopping)return;stopping=true;if(api.exitCode===null)api.kill();}
api.on('error',error=>{console.error('Web/API could not start:',error.message);stop();process.exitCode=1;});
api.on('exit',code=>{if(!stopping&&code!==0){console.error('Web/API exited unexpectedly (code '+code+').');process.exitCode=1;}});
process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log('\nRobot Investment Studio: http://127.0.0.1:'+webPort);
console.log('Simulation evidence: AnyLogic result required for trusted KPI, replay and economics.');
console.log('Browser 2D/3D is authoring + replay only; RIS does not emulate AnyLogic execution.\n');
