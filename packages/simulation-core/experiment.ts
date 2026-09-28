import type {SimulationScenarioV2} from './contracts';
import {compileScenario} from './compiler';
import {runProcessNetwork,type ProcessRun,type ProcessRunOptions} from './process-runtime';
import {compileTransportNetwork} from './transport-network';

export type SampleSummary={
 samples:number;mean:number|null;stddev:number|null;
 low95:number|null;high95:number|null;
 min:number|null;max:number|null;p5:number|null;p50:number|null;p95:number|null;
};

export type ProcessExperiment={
 engine:{name:'simcore-process-experiment';version:'1'};
 baseScenarioHash:string;replications:number;seeds:number[];
 runs:Array<{seed:number;scenarioHash:string;engineVersion:string;metrics:ProcessRun['metrics']}>;
 metrics:{
  created:SampleSummary;completed:SampleSummary;backlog:SampleSummary;
  throughputPerHour:SampleSummary;meanQueueSeconds:SampleSummary;p95CycleSeconds:SampleSummary;
  transportDistanceMeters:SampleSummary;transportEnergyKwh:SampleSummary;transportWaitSeconds:SampleSummary;
  meanTransportWaitSeconds:SampleSummary;trafficWaitSeconds:SampleSummary;robotUtilization:SampleSummary;minRobotSoc:SampleSummary;
  chargeCount:SampleSummary;chargingSeconds:SampleSummary;chargerWaitSeconds:SampleSummary;chargedEnergyKwh:SampleSummary;
 };
 resources:Record<string,{
  utilization:SampleSummary;availability:SampleSummary;downtimeSeconds:SampleSummary;
 }>;
};
const T95=[
 0,12.7062047362,4.30265272975,3.18244630528,2.7764451052,2.57058183564,
 2.44691185114,2.36462425159,2.3060041352,2.2621571628,2.22813885199,
 2.20098516008,2.17881282967,2.16036865646,2.14478668792,2.13144954556,
 2.11990529922,2.10981557783,2.10092204024,2.09302405441,2.08596344727,
 2.07961384473,2.0738730679,2.06865761042,2.06389856163,2.05953855275,
 2.05552943864,2.05183051648,2.0484071418,2.04522964213,2.0422724563,
];

function tCritical95(df:number):number{
 if(df<1)throw new RangeError('Student-t degrees of freedom must be >= 1');
 if(df<=30)return T95[df];
 if(df<=40)return 2.0422724563+(2.02107539031-2.0422724563)*(df-30)/10;
 if(df<=60)return 2.02107539031+(2.00029782201-2.02107539031)*(df-40)/20;
 if(df<=120)return 2.00029782201+(1.97993040508-2.00029782201)*(df-60)/60;
 return 1.95996398454+(1.97993040508-1.95996398454)*120/df;
}

const nearestRank=(sorted:number[],p:number)=>{
 const index=Math.max(0,Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1));
 return sorted[index];
};

export function summarizeSamples(values:number[]):SampleSummary{
 if(!values.length)return {samples:0,mean:null,stddev:null,low95:null,high95:null,min:null,max:null,p5:null,p50:null,p95:null};
 if(values.some(value=>!Number.isFinite(value)))throw new RangeError('Experiment samples must be finite');
 const sorted=[...values].sort((a,b)=>a-b);
 const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
 if(values.length===1)return {
  samples:1,mean,stddev:null,low95:null,high95:null,min:sorted[0],max:sorted[0],
  p5:sorted[0],p50:sorted[0],p95:sorted[0],
 };
 const variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/(values.length-1);
 const stddev=Math.sqrt(variance),margin=tCritical95(values.length-1)*stddev/Math.sqrt(values.length);
 return {
  samples:values.length,mean,stddev,low95:mean-margin,high95:mean+margin,
  min:sorted[0],max:sorted.at(-1)!,p5:nearestRank(sorted,.05),p50:nearestRank(sorted,.5),p95:nearestRank(sorted,.95),
 };
}

const deriveSeed=(baseSeed:number,index:number)=>{
 let x=(baseSeed+Math.imul(index+1,0x9E3779B9))>>>0;
 x^=x>>>16;x=Math.imul(x,0x85EBCA6B)>>>0;x^=x>>>13;x=Math.imul(x,0xC2B2AE35)>>>0;x^=x>>>16;
 return (x&0x7fffffff)||1;
};
const compact=(values:(number|null)[])=>values.filter((value):value is number=>value!==null);
const summarizeMetric=<K extends keyof ProcessRun['metrics']>(
 runs:ProcessRun[],key:K,
):SampleSummary=>{
 const raw=runs.map(run=>run.metrics[key]);
 const values=raw.filter((value):value is Extract<ProcessRun['metrics'][K],number>=>typeof value==='number');
 return summarizeSamples(values);
};

export function runProcessExperiment(
 scenario:SimulationScenarioV2,
 options:{replications:number;transport?:ProcessRunOptions['transport']},
):ProcessExperiment{
 if(!Number.isInteger(options.replications)||options.replications<1||options.replications>1000)
  throw new RangeError('Experiment replication count must be an integer from 1 to 1000.');
 const seeds=Array.from({length:options.replications},(_,index)=>deriveSeed(scenario.workload.seed,index));
 if(new Set(seeds).size!==seeds.length)throw new Error('Derived experiment seeds must be unique.');

 const compiled=scenario;
 const network=options.transport?compileTransportNetwork(scenario,options.transport.robotId,{safetyClearanceMeters:options.transport.safetyClearanceMeters}):undefined;
 const runOptions:ProcessRunOptions=options.transport
  ?{traceMode:'metrics',transport:{...options.transport,network}}
  :{traceMode:'metrics'};
 const processRuns=seeds.map(seed=>{
  const runScenario=compileScenario({...compiled,scenarioHash:undefined,workload:{...compiled.workload,seed}});
  return {seed,scenario:runScenario,run:runProcessNetwork(runScenario,runOptions)};
 });
 const runs=processRuns.map(({seed,scenario:runScenario,run})=>({
  seed,scenarioHash:runScenario.scenarioHash,engineVersion:run.engine.version,metrics:run.metrics,
 }));
 const runtimeRuns=processRuns.map(item=>item.run);
 const metricSummary={
  created:summarizeMetric(runtimeRuns,'created'),
  completed:summarizeMetric(runtimeRuns,'completed'),
  backlog:summarizeMetric(runtimeRuns,'backlog'),
  throughputPerHour:summarizeMetric(runtimeRuns,'throughputPerHour'),
  meanQueueSeconds:summarizeSamples(compact(runtimeRuns.map(run=>run.metrics.meanQueueSeconds))),
  p95CycleSeconds:summarizeSamples(compact(runtimeRuns.map(run=>run.metrics.p95CycleSeconds))),
  transportDistanceMeters:summarizeMetric(runtimeRuns,'transportDistanceMeters'),
  transportEnergyKwh:summarizeMetric(runtimeRuns,'transportEnergyKwh'),
  transportWaitSeconds:summarizeMetric(runtimeRuns,'transportWaitSeconds'),
  meanTransportWaitSeconds:summarizeMetric(runtimeRuns,'meanTransportWaitSeconds'),
  trafficWaitSeconds:summarizeMetric(runtimeRuns,'trafficWaitSeconds'),
  robotUtilization:summarizeMetric(runtimeRuns,'robotUtilization'),
  minRobotSoc:summarizeMetric(runtimeRuns,'minRobotSoc'),
  chargeCount:summarizeMetric(runtimeRuns,'chargeCount'),
  chargingSeconds:summarizeMetric(runtimeRuns,'chargingSeconds'),
  chargerWaitSeconds:summarizeMetric(runtimeRuns,'chargerWaitSeconds'),
  chargedEnergyKwh:summarizeMetric(runtimeRuns,'chargedEnergyKwh'),
 };
 const resourceIds=[...new Set(runtimeRuns.flatMap(run=>Object.keys(run.metrics.resourceUtilization)))].sort();
 const resourceMetric=(run:ProcessRun,resourceId:string,key:'resourceUtilization'|'resourceAvailability'|'downtimeSeconds')=>{
  const value=run.metrics[key][resourceId];
  if(value===undefined)throw new Error('Experiment resource metric missing for '+resourceId+' in '+key);
  return value;
 };
 const resources=Object.fromEntries(resourceIds.map(resourceId=>[
  resourceId,{
   utilization:summarizeSamples(runtimeRuns.map(run=>resourceMetric(run,resourceId,'resourceUtilization'))),
   availability:summarizeSamples(runtimeRuns.map(run=>resourceMetric(run,resourceId,'resourceAvailability'))),
   downtimeSeconds:summarizeSamples(runtimeRuns.map(run=>resourceMetric(run,resourceId,'downtimeSeconds'))),
  },
 ]));
 return {
  engine:{name:'simcore-process-experiment',version:'1'},
  baseScenarioHash:scenario.scenarioHash,replications:options.replications,seeds,runs,
  metrics:metricSummary,resources,
 };
}
