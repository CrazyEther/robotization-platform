import type {SimulationScenarioV2} from './contracts';
import {runEventLoop,type DesEvent} from './des';
import {generateLinearMotionEvents,planRestToRestMotion} from './motion';
import {planScenarioRoute,type NavigationRoute} from './navigation';
import {parseEventTrace,type EventTrace} from './trace';

type Task={id:string;arrival:number};
type RobotState={id:string;busy:boolean};
type SimPayload=
 | {kind:'arrival';task:Task}
 | {kind:'loadDone';task:Task;robot:RobotState}
 | {kind:'loadedMotionDone';task:Task;robot:RobotState}
 | {kind:'unloadDone';task:Task;robot:RobotState}
 | {kind:'returnDone';robot:RobotState};

export type FleetRun={
 engine:{name:'simcore-fleet';version:'1'};
 scenarioHash:string;route:NavigationRoute;trace:EventTrace;
 metrics:{
  created:number;assigned:number;completed:number;backlog:number;
  meanQueueSeconds:number|null;p95JobSeconds:number|null;
  throughputPerHour:number;robotUtilization:number;
 };
 warnings:string[];
};

const EPS=1e-9;
const MAX_TASKS=100_000;
function endpoint(scenario:SimulationScenarioV2,kind:'source'|'sink'){
 const node=scenario.process.nodes.find(item=>item.kind===kind&&item.facilityObjectId);
 if(!node?.facilityObjectId)throw new Error('Process requires a '+kind+' facility object.');
 for(const floor of scenario.facility.floors){
  if(floor.objects.some(object=>object.id===node.facilityObjectId))
   return {floorId:floor.id,objectId:node.facilityObjectId};
 }
 throw new Error('Process '+kind+' facility object is not present.');
}
function routeDuration(route:NavigationRoute,kinematics:{maxSpeedMps:number;accelerationMps2:number;decelerationMps2:number}){
 let total=0;
 for(let i=0;i<route.points.length-1;i++){
  const a=route.points[i],b=route.points[i+1],distance=Math.hypot(b.x-a.x,b.y-a.y);
  if(distance>EPS)total+=planRestToRestMotion(distance,kinematics).totalSeconds;
 }
 return total;
}
function reverseRoute(route:NavigationRoute):NavigationRoute{
 return {...route,points:[...route.points].reverse()};
}
function percentile95(values:number[]):number|null{
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.max(0,Math.ceil(.95*sorted.length)-1)];
}
function mulberry32(seed:number){
 let state=seed>>>0;
 return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function arrivals(scenario:SimulationScenarioV2,horizon:number):number[]{
 const rate=scenario.workload.demandPerHour/3600;
 const result:number[]=[];
 if(scenario.workload.arrivalProcess==='fixed'){
  const interval=1/rate;
  for(let t=0;t<horizon-EPS;t+=interval){
   result.push(t);if(result.length>MAX_TASKS)throw new RangeError('Transport runner task limit exceeded');
  }
  return result;
 }
 const random=mulberry32(scenario.workload.seed);let t=0;
 while(true){
  const u=Math.max(Number.MIN_VALUE,1-random());
  t+=-Math.log(u)/rate;
  if(t>=horizon-EPS)break;
  result.push(t);if(result.length>MAX_TASKS)throw new RangeError('Transport runner task limit exceeded');
 }
 return result;
}

export function runTransportFleet(
 scenario:SimulationScenarioV2,
 options:{robotId:string;safetyClearanceMeters:number;samplePeriodSeconds:number},
):FleetRun{
 if(!Number.isFinite(options.samplePeriodSeconds)||options.samplePeriodSeconds<=0)
  throw new RangeError('samplePeriodSeconds must be finite and > 0');
 const robotSpec=scenario.robots.find(item=>item.id===options.robotId);
 if(!robotSpec)throw new Error('Unknown robot: '+options.robotId);
 const source=endpoint(scenario,'source'),sink=endpoint(scenario,'sink');
 if(source.floorId!==sink.floorId)throw new Error('simcore-fleet/1 does not support multi-floor transport.');
 const route=planScenarioRoute({
  scenario,floorId:source.floorId,startObjectId:source.objectId,endObjectId:sink.objectId,
  robotId:robotSpec.id,safetyClearanceMeters:options.safetyClearanceMeters,
 });
 if(!route)throw new Error('No physically clear route exists for the configured robot footprint.');
 const returnRoute=reverseRoute(route);
 const kinematics={
  maxSpeedMps:robotSpec.kinematics.maxSpeedMps,
  accelerationMps2:robotSpec.kinematics.accelerationMps2,
  decelerationMps2:robotSpec.kinematics.decelerationMps2,
 };
 const loadedMotionSeconds=routeDuration(route,kinematics);
 const returnMotionSeconds=routeDuration(returnRoute,kinematics);
 const horizon=scenario.workload.shiftHours*3600;
 const taskArrivals=arrivals(scenario,horizon);
 const tasks=taskArrivals.map((arrival,index):Task=>({id:'T'+(index+1),arrival}));
 const robots=Array.from({length:robotSpec.fleetSize},(_,index):RobotState=>({
  id:robotSpec.id+'#'+(index+1),busy:false,
 }));
 const pending:Task[]=[];let pendingHead=0,assigned=0,completed=0,busySeconds=0;
 const queueWaits:number[]=[],jobSeconds:number[]=[];
 type RawTraceEvent=Parameters<typeof parseEventTrace>[0] extends never?never:Record<string,unknown>;
 const traceRecords:{event:RawTraceEvent;order:number}[]=[];let traceOrder=0;
 const push=(event:RawTraceEvent)=>{
  if(traceRecords.length>=1_000_000)throw new RangeError('EventTrace event limit exceeded');
  traceRecords.push({event,order:traceOrder++});
 };
 const addRouteMotion=(motionRoute:NavigationRoute,startTime:number,resourceId:string,idPrefix:string,taskId:string|undefined,motionKind:'loaded'|'empty')=>{
  let t=startTime;
  for(let segment=0;segment<motionRoute.points.length-1;segment++){
   const a=motionRoute.points[segment],b=motionRoute.points[segment+1];
   const distance=Math.hypot(b.x-a.x,b.y-a.y);if(distance<=EPS)continue;
   const generated=generateLinearMotionEvents({
    idPrefix:idPrefix+'-s'+segment,resourceId,floorId:source.floorId,start:a,end:b,
    startTimeSeconds:t,samplePeriodSeconds:options.samplePeriodSeconds,kinematics,
   });
   for(const event of (segment===0?generated:generated.slice(1))){
    push({...event,...(taskId?{taskId}:{}),data:{...event.data,motionKind}});
   }
   t+=planRestToRestMotion(distance,kinematics).totalSeconds;
  }
 };
 const dispatch=(now:number,schedule:(event:DesEvent<SimPayload>)=>void)=>{
  while(pendingHead<pending.length){
   const available=robots.find(item=>!item.busy);if(!available)break;
   const task=pending[pendingHead++];available.busy=true;assigned++;
   const wait=now-task.arrival;queueWaits.push(wait);
   push({id:task.id+'-assigned',t:now,type:'task.assigned',taskId:task.id,resourceId:available.id,data:{queueSeconds:wait}});
   push({id:task.id+'-load-start',t:now,type:'process.started',taskId:task.id,resourceId:source.objectId,data:{phase:'loading'}});
   const readyAt=now+robotSpec.handling.loadSeconds+loadedMotionSeconds+robotSpec.handling.unloadSeconds+returnMotionSeconds;
   busySeconds+=Math.max(0,Math.min(horizon,readyAt)-now);
   schedule({at:now+robotSpec.handling.loadSeconds,priority:0,payload:{kind:'loadDone',task,robot:available}});
  }
 };
 const initial:DesEvent<SimPayload>[]=tasks.map(task=>({at:task.arrival,priority:1,payload:{kind:'arrival',task}}));
 runEventLoop(initial,horizon,(event,schedule)=>{
  const {payload}=event,now=event.at;
  if(payload.kind==='arrival'){
   pending.push(payload.task);
   push({id:payload.task.id+'-created',t:now,type:'task.created',taskId:payload.task.id});
   dispatch(now,schedule);return;
  }
  if(payload.kind==='loadDone'){
   push({id:payload.task.id+'-load-complete',t:now,type:'process.completed',taskId:payload.task.id,resourceId:source.objectId,data:{phase:'loading'}});
   addRouteMotion(route,now,payload.robot.id,payload.task.id+'-'+payload.robot.id+'-loaded',payload.task.id,'loaded');
   schedule({at:now+loadedMotionSeconds,priority:0,payload:{kind:'loadedMotionDone',task:payload.task,robot:payload.robot}});
   return;
  }
  if(payload.kind==='loadedMotionDone'){
   push({id:payload.task.id+'-unload-start',t:now,type:'process.started',taskId:payload.task.id,resourceId:sink.objectId,data:{phase:'unloading'}});
   schedule({at:now+robotSpec.handling.unloadSeconds,priority:0,payload:{kind:'unloadDone',task:payload.task,robot:payload.robot}});
   return;
  }
  if(payload.kind==='unloadDone'){
   push({id:payload.task.id+'-unload-complete',t:now,type:'process.completed',taskId:payload.task.id,resourceId:sink.objectId,data:{phase:'unloading'}});
   push({id:payload.task.id+'-completed',t:now,type:'task.completed',taskId:payload.task.id,resourceId:payload.robot.id});
   completed++;jobSeconds.push(now-payload.task.arrival);
   addRouteMotion(returnRoute,now,payload.robot.id,payload.task.id+'-'+payload.robot.id+'-empty',undefined,'empty');
   schedule({at:now+returnMotionSeconds,priority:0,payload:{kind:'returnDone',robot:payload.robot}});
   return;
  }
  payload.robot.busy=false;dispatch(now,schedule);
 });
 const events=traceRecords.filter(record=>(record.event.t as number)<=horizon+EPS)
  .sort((a,b)=>(a.event.t as number)-(b.event.t as number)||a.order-b.order).map(record=>record.event);
 const trace=parseEventTrace({
  schemaVersion:'ris-event-trace/1',scenarioHash:scenario.scenarioHash,
  engine:{name:'simcore-fleet',version:'1'},startedAt:'1970-01-01T00:00:00.000Z',events,
 },scenario);
 const meanQueueSeconds=queueWaits.length?queueWaits.reduce((a,b)=>a+b,0)/queueWaits.length:null;
 return {
  engine:{name:'simcore-fleet',version:'1'},scenarioHash:scenario.scenarioHash,route,trace,
  metrics:{
   created:tasks.length,assigned,completed,backlog:tasks.length-completed,
   meanQueueSeconds,p95JobSeconds:percentile95(jobSeconds),
   throughputPerHour:horizon>0?completed/(horizon/3600):0,
   robotUtilization:horizon>0?busySeconds/(robotSpec.fleetSize*horizon):0,
  },
  warnings:[
   'simcore-fleet/1 uses FCFS dispatch and a return-to-source policy.',
   'Traffic conflicts, charging, failures and continuous cornering are not modeled in this runner yet.',
  ],
 };
}
