import type {SimulationScenarioV2} from './contracts';
import {runEventLoop,type DesEvent} from './des';
import {parseEventTrace,type EventTrace} from './trace';
import {generateArrivalTimes} from './workload';
import {generateDowntimeWindows,nextOperationalTime,operationalSeconds,serviceCompletionTime,type DowntimeWindow} from './reliability';
import {sampleDurationSeconds} from './distribution';
import {createSeededRandom} from './random';
import {MobileTransportRuntime,type MobileTransportEvent} from './mobile-transport-runtime';
import type {TransportNetwork} from './transport-network';
import {compileProcessGraph} from './process-graph';

type ProcessNode=SimulationScenarioV2['process']['nodes'][number];
type Task={id:string;arrival:number;transitions:number};
type QueueItem={task:Task;node:ProcessNode;enteredAt:number};
type ResourceState={id:string;capacity:number;busy:number;queue:QueueItem[];busySeconds:number;downtimes:DowntimeWindow[];wakeAt:number|null;random:()=>number};
type Payload=
 | {kind:'arrival';task:Task}
 | {kind:'wake';resourceId:string}
 | {kind:'complete';task:Task;node:ProcessNode;resourceId:string}
 | MobileTransportEvent;

export type ProcessRunOptions={
 traceMode?:'full'|'metrics';
 maxTransitionsPerTask?:number;
 transport?:{robotId:string;safetyClearanceMeters:number;samplePeriodSeconds:number;network?:TransportNetwork};
};
export type ProcessRun={
 engine:{name:'simcore-process';version:'4'};
 scenarioHash:string;trace:EventTrace;
 metrics:{
  created:number;completed:number;backlog:number;
  throughputPerHour:number;meanQueueSeconds:number|null;p95CycleSeconds:number|null;
  resourceUtilization:Record<string,number>;
  resourceAvailability:Record<string,number>;downtimeSeconds:Record<string,number>;
  transportDistanceMeters:number;transportEnergyKwh:number;transportWaitSeconds:number;meanTransportWaitSeconds:number;
  trafficWaitSeconds:number;robotUtilization:number;minRobotSoc:number;
  chargeCount:number;chargingSeconds:number;chargerWaitSeconds:number;chargedEnergyKwh:number;
 };
 warnings:string[];
};

const EPS=1e-9;
const MAX_TASKS=100_000;
const percentile95=(values:number[])=>{
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)];
};
const seedForResource=(base:number,id:string)=>{
 let hash=2166136261>>>0;
 for(let i=0;i<id.length;i++){hash^=id.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0;}
 return (base^hash)>>>0;
};
function nodeHasService(node:ProcessNode):boolean{
 if(node.kind==='source'||node.kind==='sink')return false;
 if(node.durationModel!==undefined)return true;
 if(node.durationSeconds!==undefined)return node.durationSeconds>0;
 if(node.kind==='buffer'||node.kind==='decision')return false;
 throw new Error('Process node requires durationSeconds or durationModel: '+node.id);
}
function sampleNodeDuration(node:ProcessNode,random:()=>number):number{
 if(node.durationModel!==undefined)return sampleDurationSeconds(node.durationModel,random);
 if(node.durationSeconds!==undefined)return node.durationSeconds;
 if(node.kind==='buffer'||node.kind==='decision')return 0;
 throw new Error('Process node requires durationSeconds or durationModel: '+node.id);
}

export function runProcessNetwork(scenario:SimulationScenarioV2,options:ProcessRunOptions={}):ProcessRun{
 const traceEnabled=options.traceMode!=='metrics';
 const graph=compileProcessGraph(scenario),nodesById=graph.nodesById;
 const unsupportedBuffer=scenario.process.nodes.find(node=>node.kind==='buffer');
 if(unsupportedBuffer)throw new Error('Finite buffer occupancy is not implemented in simcore-process/4; buffer nodes are fail-closed: '+unsupportedBuffer.id);
 const maxTransitions=options.maxTransitionsPerTask??10_000;
 if(!Number.isInteger(maxTransitions)||maxTransitions<1||maxTransitions>1_000_000)
  throw new RangeError('maxTransitionsPerTask must be an integer from 1 to 1000000.');
 const decisionRandom=createSeededRandom(seedForResource(scenario.workload.seed,'process-routing'));
 const transportEdges=scenario.process.edges.filter(edge=>edge.mode==='transport');
 if(transportEdges.length&&!options.transport)
  throw new Error('Process contains transport edges but no mobile transport adapter/options are configured.');
 const objectMap=new Map(scenario.facility.floors.flatMap(floor=>floor.objects.map(object=>[object.id,object] as const)));
 const resourceFor=(node:ProcessNode)=>{
  const key=node.facilityObjectId??'process-node:'+node.id;
  const object=node.facilityObjectId?objectMap.get(node.facilityObjectId):undefined;
  const capacity=object?object.capacity:1;
  if(capacity<1)throw new Error('Process resource capacity must be >= 1: '+key);
  return {key,capacity,reliability:object?.reliability};
 };
 const horizon=scenario.workload.shiftHours*3600;
 const resources=new Map<string,ResourceState>();
 for(const node of scenario.process.nodes){
  if(!nodeHasService(node))continue;
  const {key,capacity,reliability}=resourceFor(node),existing=resources.get(key);
  if(existing&&existing.capacity!==capacity)throw new Error('Shared process resource has inconsistent capacity: '+key);
  if(!existing)resources.set(key,{id:key,capacity,busy:0,queue:[],busySeconds:0,
   downtimes:reliability?generateDowntimeWindows(reliability,horizon,seedForResource(scenario.workload.seed,key+'|reliability')):[],
   wakeAt:null,random:createSeededRandom(seedForResource(scenario.workload.seed,key+'|service'))});
 }
 const arrivals=generateArrivalTimes(scenario.workload,horizon,MAX_TASKS);
 const tasks=arrivals.map((arrival,index):Task=>({id:'P'+(index+1),arrival,transitions:0}));
 const tasksById=new Map(tasks.map(task=>[task.id,task] as const));
 let created=0,completed=0,traceOrder=0;
 const queueWaits:number[]=[],cycles:number[]=[];
 const raw:{event:Record<string,unknown>;order:number}[]=[],eventIdCounts=new Map<string,number>();
 const push=(event:Record<string,unknown>)=>{if(!traceEnabled)return;const base=String(event.id),count=eventIdCounts.get(base)??0;eventIdCounts.set(base,count+1);raw.push({event:count?{...event,id:base+'#'+count}:event,order:traceOrder++});};
 const mobileTransport=transportEdges.length
  ?new MobileTransportRuntime(scenario,{...options.transport!,emitMotion:traceEnabled},horizon,push)
  :null;
 const finishTask=(task:Task,now:number)=>{
  completed++;cycles.push(now-task.arrival);
  push({id:task.id+'-completed',t:now,type:'task.completed',taskId:task.id});
 };
 function advance(task:Task,node:ProcessNode,now:number,schedule:(event:DesEvent<Payload>)=>void){
  task.transitions++;
  if(task.transitions>maxTransitions)throw new Error('Process task exceeded max transitions; probable non-terminating rework loop: '+task.id);
  const edge=graph.chooseEdge(node,decisionRandom);
  if(!edge)throw new Error('Process node has no outgoing edge: '+node.id);
  const next=nodesById.get(edge.to);
  if(!next)throw new Error('Process edge points to unknown node: '+edge.id);
  if(edge.mode==='transport'){
   if(!mobileTransport)throw new Error('Transport edge requires a mobile transport adapter.');
   mobileTransport.request(task.id,edge.id,now,(at,payload)=>schedule({at,priority:0,payload}));
   return;
  }
  enter(task,next,now,schedule);
 }
 function enter(task:Task,node:ProcessNode,now:number,schedule:(event:DesEvent<Payload>)=>void){
  if(node.kind==='source'){advance(task,node,now,schedule);return;}
  if(node.kind==='sink'){finishTask(task,now);return;}
  if(!nodeHasService(node)){advance(task,node,now,schedule);return;}
  const {key}=resourceFor(node),resource=resources.get(key)!;
  resource.queue.push({task,node,enteredAt:now});
  dispatchResource(resource,now,schedule);
 }
 const dispatchResource=(resource:ResourceState,now:number,schedule:(event:DesEvent<Payload>)=>void)=>{
  while(resource.busy<resource.capacity&&resource.queue.length){
   const start=nextOperationalTime(now,resource.downtimes);
   if(start>now+EPS){
    if(resource.wakeAt===null||start<resource.wakeAt-EPS){
     resource.wakeAt=start;
     schedule({at:start,priority:0,payload:{kind:'wake',resourceId:resource.id}});
    }
    break;
   }
   const item=resource.queue.shift()!,duration=sampleNodeDuration(item.node,resource.random),wait=now-item.enteredAt;
   const completion=serviceCompletionTime(now,duration,resource.downtimes);
   resource.busy++;queueWaits.push(wait);
   resource.busySeconds+=Math.min(duration,operationalSeconds(now,Math.min(horizon,completion),resource.downtimes));
   push({id:item.task.id+'-'+item.node.id+'-start',t:now,type:'process.started',taskId:item.task.id,
    ...(item.node.facilityObjectId?{resourceId:item.node.facilityObjectId}:{}),
    data:{nodeId:item.node.id,queueSeconds:wait}});
   schedule({at:completion,priority:0,payload:{
    kind:'complete',task:item.task,node:item.node,resourceId:resource.id,
   }});
  }
 };
 for(const resource of resources.values()){
  resource.downtimes.forEach((window,index)=>{
   if(window.start<horizon)push({id:'failure-'+resource.id+'-'+index,t:window.start,type:'resource.failed',resourceId:resource.id,
    data:{repairExpectedAt:window.end}});
   if(window.end<=horizon)push({id:'repair-'+resource.id+'-'+index,t:window.end,type:'resource.repaired',resourceId:resource.id});
  });
 }
 const initial:DesEvent<Payload>[]=tasks.map(task=>({at:task.arrival,priority:1,payload:{kind:'arrival',task}}));
 runEventLoop(initial,horizon,(event,schedule)=>{
  const {payload}=event,now=event.at;
  if(payload.kind==='arrival'){
   created++;
   push({id:payload.task.id+'-created',t:now,type:'task.created',taskId:payload.task.id});
   enter(payload.task,graph.source,now,schedule);
   return;
  }
  if(payload.kind==='wake'){
   const resource=resources.get(payload.resourceId)!;
   resource.wakeAt=null;
   dispatchResource(resource,now,schedule);
   return;
  }
  if(payload.kind==='mobile-transport-complete'||payload.kind==='mobile-charge-arrive'||
   payload.kind==='mobile-charge-start'||payload.kind==='mobile-charge-done'){
   if(!mobileTransport)throw new Error('Mobile runtime event received without mobile transport runtime.');
   const completedTransport=mobileTransport.handle(payload,now,(at,next)=>schedule({at,priority:0,payload:next}));
   if(!completedTransport)return;
   const task=tasksById.get(completedTransport.taskId);
   const edge=scenario.process.edges.find(item=>item.id===completedTransport.edgeId);
   if(!task||!edge)throw new Error('Transport completion references unknown task or process edge.');
   const destination=nodesById.get(edge.to);
   if(!destination)throw new Error('Transport completion destination is missing.');
   enter(task,destination,now,schedule);
   return;
  }
  const resource=resources.get(payload.resourceId)!;
  resource.busy--;
  push({id:payload.task.id+'-'+payload.node.id+'-complete',t:now,type:'process.completed',
   taskId:payload.task.id,...(payload.node.facilityObjectId?{resourceId:payload.node.facilityObjectId}:{}),
   data:{nodeId:payload.node.id}});
  dispatchResource(resource,now,schedule);
  advance(payload.task,payload.node,now,schedule);
 });
 const engine={name:'simcore-process' as const,version:'4' as const};
 const trace:EventTrace=traceEnabled?parseEventTrace({
  schemaVersion:'ris-event-trace/1',scenarioHash:scenario.scenarioHash,engine,
  startedAt:'1970-01-01T00:00:00.000Z',
  events:raw.sort((a,b)=>(Number(a.event.t)-Number(b.event.t))||a.order-b.order).map(item=>item.event),
 },scenario):{
  schemaVersion:'ris-event-trace/1',scenarioHash:scenario.scenarioHash,engine,
  startedAt:'1970-01-01T00:00:00.000Z',events:[],
 };
 const resourceUtilization=Object.fromEntries([...resources.values()].map(resource=>[
  resource.id,horizon>0?resource.busySeconds/(resource.capacity*horizon):0,
 ]));
 const downtimeSeconds=Object.fromEntries([...resources.values()].map(resource=>[
  resource.id,horizon>0?horizon-operationalSeconds(0,horizon,resource.downtimes):0,
 ]));
 const resourceAvailability=Object.fromEntries([...resources.values()].map(resource=>[
  resource.id,horizon>0?operationalSeconds(0,horizon,resource.downtimes)/horizon:1,
 ]));
 const transportMetrics=mobileTransport?.metrics()??{
  distanceMeters:0,energyKwh:0,waitSeconds:0,meanWaitSeconds:0,trafficWaitSeconds:0,busySeconds:0,robotUtilization:0,minSocObserved:1,startedRequests:0,
  chargeCount:0,chargingSeconds:0,chargerWaitSeconds:0,chargedEnergyKwh:0,
 };
 return {
  engine,scenarioHash:scenario.scenarioHash,trace,
  metrics:{
   created,completed,backlog:created-completed,
   throughputPerHour:horizon>0?completed/(horizon/3600):0,
   meanQueueSeconds:queueWaits.length?queueWaits.reduce((a,b)=>a+b,0)/queueWaits.length:null,
   p95CycleSeconds:percentile95(cycles),resourceUtilization,resourceAvailability,downtimeSeconds,
   transportDistanceMeters:transportMetrics.distanceMeters,transportEnergyKwh:transportMetrics.energyKwh,
   transportWaitSeconds:transportMetrics.waitSeconds,meanTransportWaitSeconds:transportMetrics.meanWaitSeconds,
   trafficWaitSeconds:transportMetrics.trafficWaitSeconds,
   robotUtilization:transportMetrics.robotUtilization,minRobotSoc:transportMetrics.minSocObserved,
   chargeCount:transportMetrics.chargeCount,chargingSeconds:transportMetrics.chargingSeconds,
   chargerWaitSeconds:transportMetrics.chargerWaitSeconds,chargedEnergyKwh:transportMetrics.chargedEnergyKwh,
  },
  warnings:[
   'simcore-process/4 executes validated process graphs with probabilistic branching/rework, stochastic service, reliability and optional mobile transport.',
   'Finite buffer occupancy and multi-floor lift transport are intentionally fail-closed in this version.',
   ...(mobileTransport?[
    'Integrated mobile transport preserves robot position, models empty reposition and uses conservative floor-level traffic reservations.',
    'Integrated mobile transport initializes all robots at the origin of the first compiled transport leg.',
    'Transport distance and energy KPIs include completed transport jobs only; unfinished motion at the horizon remains visible in replay but is excluded from aggregates.',
    'Integrated mobile transport preserves minimum SOC by routing low-energy robots through reachable charger channels before dispatch.',
   ]:[]),
  ],
 };
}
