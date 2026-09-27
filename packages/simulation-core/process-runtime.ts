import type {SimulationScenarioV2} from './contracts';
import {runEventLoop,type DesEvent} from './des';
import {parseEventTrace,type EventTrace} from './trace';
import {generateArrivalTimes} from './workload';

type ProcessNode=SimulationScenarioV2['process']['nodes'][number];
type Task={id:string;arrival:number};
type QueueItem={task:Task;node:ProcessNode;enteredAt:number};
type ResourceState={id:string;capacity:number;busy:number;queue:QueueItem[];busySeconds:number};
type Payload=
 | {kind:'arrival';task:Task}
 | {kind:'complete';task:Task;node:ProcessNode;resourceId:string};

export type ProcessRun={
 engine:{name:'simcore-process';version:'1'};
 scenarioHash:string;trace:EventTrace;
 metrics:{
  created:number;completed:number;backlog:number;
  throughputPerHour:number;meanQueueSeconds:number|null;p95CycleSeconds:number|null;
  resourceUtilization:Record<string,number>;
 };
 warnings:string[];
};

const MAX_TASKS=100_000;
const percentile95=(values:number[])=>{
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)];
};
function linearOrder(scenario:SimulationScenarioV2):ProcessNode[]{
 const nodes=new Map(scenario.process.nodes.map(node=>[node.id,node] as const));
 const sources=scenario.process.nodes.filter(node=>node.kind==='source');
 const sinks=scenario.process.nodes.filter(node=>node.kind==='sink');
 if(sources.length!==1||sinks.length!==1)throw new Error('Process Runtime v1 requires one linear source and one linear sink.');
 const outgoing=new Map<string,string[]>(),incoming=new Map<string,string[]>();
 for(const node of scenario.process.nodes){outgoing.set(node.id,[]);incoming.set(node.id,[]);}
 for(const edge of scenario.process.edges){outgoing.get(edge.from)!.push(edge.to);incoming.get(edge.to)!.push(edge.from);}
 for(const node of scenario.process.nodes){
  const out=outgoing.get(node.id)!,inc=incoming.get(node.id)!;
  if(node.kind==='source'){
   if(inc.length!==0||out.length!==1)throw new Error('Process Runtime v1 rejects branching: source must have one outgoing edge.');
  }else if(node.kind==='sink'){
   if(inc.length!==1||out.length!==0)throw new Error('Process Runtime v1 requires a terminal linear sink.');
  }else if(inc.length!==1||out.length!==1){
   throw new Error('Process Runtime v1 rejects branching and disconnected nodes.');
  }
 }
 const order:ProcessNode[]=[];const seen=new Set<string>();let current=sources[0];
 while(true){
  if(seen.has(current.id))throw new Error('Process Runtime v1 rejects process cycles.');
  seen.add(current.id);order.push(current);
  if(current.kind==='sink')break;
  current=nodes.get(outgoing.get(current.id)![0])!;
 }
 if(order.length!==scenario.process.nodes.length||order.at(-1)?.id!==sinks[0].id)
  throw new Error('Process Runtime v1 requires one connected linear process.');
 return order;
}
function nodeDuration(node:ProcessNode):number{
 if(node.kind==='source'||node.kind==='sink'||node.kind==='buffer'||node.kind==='decision')return node.durationSeconds??0;
 if(node.durationSeconds===undefined)throw new Error('Process node requires durationSeconds: '+node.id);
 return node.durationSeconds;
}

export function runProcessNetwork(scenario:SimulationScenarioV2):ProcessRun{
 const order=linearOrder(scenario),indexById=new Map(order.map((node,index)=>[node.id,index] as const));
 const objectMap=new Map(scenario.facility.floors.flatMap(floor=>floor.objects.map(object=>[object.id,object] as const)));
 const resourceFor=(node:ProcessNode)=>{
  const key=node.facilityObjectId??'process-node:'+node.id;
  const object=node.facilityObjectId?objectMap.get(node.facilityObjectId):undefined;
  const capacity=object?object.capacity:1;
  if(capacity<1)throw new Error('Process resource capacity must be >= 1: '+key);
  return {key,capacity};
 };
 const resources=new Map<string,ResourceState>();
 for(const node of order){
  const duration=nodeDuration(node);
  if(node.kind==='source'||node.kind==='sink'||duration<=0)continue;
  const {key,capacity}=resourceFor(node),existing=resources.get(key);
  if(existing&&existing.capacity!==capacity)throw new Error('Shared process resource has inconsistent capacity: '+key);
  if(!existing)resources.set(key,{id:key,capacity,busy:0,queue:[],busySeconds:0});
 }
 const horizon=scenario.workload.shiftHours*3600;
 const arrivals=generateArrivalTimes(scenario.workload,horizon,MAX_TASKS);
 const tasks=arrivals.map((arrival,index):Task=>({id:'P'+(index+1),arrival}));
 let created=0,completed=0,traceOrder=0;
 const queueWaits:number[]=[],cycles:number[]=[];
 const raw:{event:Record<string,unknown>;order:number}[]=[];
 const push=(event:Record<string,unknown>)=>raw.push({event,order:traceOrder++});
 const nextNode=(node:ProcessNode)=>order[indexById.get(node.id)!+1];
 const finishTask=(task:Task,now:number)=>{
  completed++;cycles.push(now-task.arrival);
  push({id:task.id+'-completed',t:now,type:'task.completed',taskId:task.id});
 };
 const enter=(task:Task,node:ProcessNode,now:number,schedule:(event:DesEvent<Payload>)=>void)=>{
  if(node.kind==='source'){
   enter(task,nextNode(node),now,schedule);return;
  }
  if(node.kind==='sink'){finishTask(task,now);return;}
  const duration=nodeDuration(node);
  if(duration<=0){enter(task,nextNode(node),now,schedule);return;}
  const {key}=resourceFor(node),resource=resources.get(key)!;
  resource.queue.push({task,node,enteredAt:now});
  dispatchResource(resource,now,schedule);
 };
 const dispatchResource=(resource:ResourceState,now:number,schedule:(event:DesEvent<Payload>)=>void)=>{
  while(resource.busy<resource.capacity&&resource.queue.length){
   const item=resource.queue.shift()!,duration=nodeDuration(item.node),wait=now-item.enteredAt;
   resource.busy++;queueWaits.push(wait);
   resource.busySeconds+=Math.max(0,Math.min(horizon,now+duration)-now);
   push({id:item.task.id+'-'+item.node.id+'-start',t:now,type:'process.started',taskId:item.task.id,
    ...(item.node.facilityObjectId?{resourceId:item.node.facilityObjectId}:{}),
    data:{nodeId:item.node.id,queueSeconds:wait}});
   schedule({at:now+duration,priority:0,payload:{
    kind:'complete',task:item.task,node:item.node,resourceId:resource.id,
   }});
  }
 };
 const initial:DesEvent<Payload>[]=tasks.map(task=>({at:task.arrival,priority:1,payload:{kind:'arrival',task}}));
 runEventLoop(initial,horizon,(event,schedule)=>{
  const {payload}=event,now=event.at;
  if(payload.kind==='arrival'){
   created++;
   push({id:payload.task.id+'-created',t:now,type:'task.created',taskId:payload.task.id});
   enter(payload.task,order[0],now,schedule);
   return;
  }
  const resource=resources.get(payload.resourceId)!;
  resource.busy--;
  push({id:payload.task.id+'-'+payload.node.id+'-complete',t:now,type:'process.completed',
   taskId:payload.task.id,...(payload.node.facilityObjectId?{resourceId:payload.node.facilityObjectId}:{}),
   data:{nodeId:payload.node.id}});
  dispatchResource(resource,now,schedule);
  enter(payload.task,nextNode(payload.node),now,schedule);
 });
 const engine={name:'simcore-process' as const,version:'1' as const};
 const trace=parseEventTrace({
  schemaVersion:'ris-event-trace/1',scenarioHash:scenario.scenarioHash,engine,
  startedAt:'1970-01-01T00:00:00.000Z',
  events:raw.sort((a,b)=>(Number(a.event.t)-Number(b.event.t))||a.order-b.order).map(item=>item.event),
 },scenario);
 const resourceUtilization=Object.fromEntries([...resources.values()].map(resource=>[
  resource.id,horizon>0?resource.busySeconds/(resource.capacity*horizon):0,
 ]));
 return {
  engine,scenarioHash:scenario.scenarioHash,trace,
  metrics:{
   created,completed,backlog:created-completed,
   throughputPerHour:horizon>0?completed/(horizon/3600):0,
   meanQueueSeconds:queueWaits.length?queueWaits.reduce((a,b)=>a+b,0)/queueWaits.length:null,
   p95CycleSeconds:percentile95(cycles),resourceUtilization,
  },
  warnings:[
   'simcore-process/1 executes one connected linear process with deterministic node durations and FCFS resources.',
   'Branching, rework loops, finite buffer occupancy and coupling to mobile transport are intentionally fail-closed in this version.',
  ],
 };
}
