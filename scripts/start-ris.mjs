/* global process, console */
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';

const cwd=resolve(import.meta.dirname,'..');
const simulationPort=Number(process.env.RIS_SIM_PORT??8900);
const webPort=Number(process.env.RIS_WEB_PORT??8890);
const key=randomBytes(32).toString('hex');
const env={...process.env,SIMULATION_SERVICE_KEY:key,SIMULATION_ENGINE_URL:'http://127.0.0.1:'+simulationPort,PORT:String(webPort)};
const defaultPython=process.platform==='win32'?'python':'python3';
const pythonFromEnv=process.env.RIS_PYTHON;
const allowedPythonNames=new Set(['python','python3','py']);
const allowedAbsolutePythonPath=/^(\/[A-Za-z0-9._-]+)+$|^[A-Za-z]:\\(?:[A-Za-z0-9._-]+\\)*[A-Za-z0-9._-]+(\.exe)?$/;
let python=defaultPython;
if(pythonFromEnv){
 if(allowedPythonNames.has(pythonFromEnv)&&!pythonFromEnv.includes('..')){
  python=pythonFromEnv;
 }else if(allowedAbsolutePythonPath.test(pythonFromEnv)&&!pythonFromEnv.includes('..')){
  python=pythonFromEnv;
 }
}
const simulation=spawn(python,['-m','uvicorn','app:app','--app-dir','services/simulation','--host','127.0.0.1','--port',String(simulationPort)],{cwd,env,stdio:'inherit'});
const api=spawn(process.execPath,[resolve(cwd,'node_modules','tsx','dist','cli.mjs'),'apps/api/server.ts'],{cwd,env,stdio:'inherit'});
const children=[simulation,api];let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)if(child.exitCode===null)child.kill();}
for(const [name,child] of [['SimPy',simulation],['Web/API',api]]){
 child.on('error',error=>{console.error(name+' could not start:',error.message);stop();process.exitCode=1;});
 child.on('exit',(code)=>{if(!stopping){console.error(name+' exited unexpectedly (code '+code+').');stop();process.exitCode=1;}});
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log('\nRobot Investment Studio: http://127.0.0.1:'+webPort);
console.log('SimPy compute service: http://127.0.0.1:'+simulationPort+'/health');
console.log('Both processes must remain running for simulation-based investment calculations.\n');
