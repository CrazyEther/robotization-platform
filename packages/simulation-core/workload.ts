import type {SimulationScenarioV2} from './contracts';

const EPS=1e-9;

function mulberry32(seed:number){
 let state=seed>>>0;
 return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}

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
 const random=mulberry32(workload.seed);let t=0;
 while(true){
  const u=Math.max(Number.MIN_VALUE,1-random());
  t+=-Math.log(u)/rate;
  if(t>=horizonSeconds-EPS)break;
  push(t);
 }
 return result;
}
