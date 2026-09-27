import type {SimulationScenarioV2} from './contracts';
import {createSeededRandom} from './random';

const EPS=1e-9;

export function generateArrivalTimes(
 workload:SimulationScenarioV2['workload'],horizonSeconds:number,maxTasks=100_000,
):number[]{
 if(!Number.isFinite(horizonSeconds)||horizonSeconds<0)throw new RangeError('Arrival horizon must be finite and >= 0');
 if(!Number.isInteger(maxTasks)||maxTasks<1)throw new RangeError('maxTasks must be a positive integer');
 const rate=workload.demandPerHour/3600;
 const result:number[]=[];
 const push=(time:number)=>{result.push(time);if(result.length>maxTasks)throw new RangeError('Workload task limit exceeded');};
 if(workload.arrivalProcess==='fixed'){
  const interval=1/rate;
  for(let t=0;t<horizonSeconds-EPS;t+=interval)push(t);
  return result;
 }
 const random=createSeededRandom(workload.seed);let t=0;
 while(true){
  const u=Math.max(Number.MIN_VALUE,1-random());
  t+=-Math.log(u)/rate;
  if(t>=horizonSeconds-EPS)break;
  push(t);
 }
 return result;
}
