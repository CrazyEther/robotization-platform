import type {SimulationScenarioV2} from './contracts';
import {runEventLoop,type DesEvent} from './des';
import {generateLinearMotionEvents,planRestToRestMotion} from './motion';
import {planScenarioRoute,type NavigationRoute} from './navigation';
import {parseEventTrace,type EventTrace} from './trace';
import {ReservationTable,type Reservation} from './traffic';
import {chargeDurationSeconds,motionEnergyWh} from './energy';

type Task={id:string;arrival:number};
type RobotState={id:string;busy:boolean;busyStartedAt:number|null;energyWh:number};
type ChargePlan={
 sequence:number;chargerId:string;channelId:string;routeToCharger:NavigationRoute;routeToSource:NavigationRoute;
 travelWh:number;returnWh:number;traffic:Reservation;channel:Reservation;
};
type SimPayload=
 | {kind:'arrival';task:Task}
 | {kind:'loadDone';task:Task;robot:RobotState}
 | {kind:'loadedMotionDone';task:Task;robot:RobotState}
 | {kind:'unloadDone';task:Task;robot:RobotState}
 | {kind:'returnDone';robot:RobotState}
 | {kind:'chargerArrive';robot:RobotState;plan:ChargePlan}
 | {kind:'chargeStart';robot:RobotState;plan:ChargePlan}
 | {kind:'chargeDone';robot:RobotState;plan:ChargePlan}
 | {kind:'chargeReturnDone';robot:RobotState;plan:ChargePlan};

export type FleetRun={
 engine:{name:'simcore-fleet';version:'1'};
 scenarioHash:string;route:NavigationRoute;trace:EventTrace;
 metrics:{
  created:number;assigned:number;completed:number;backlog:number;
  meanQueueSeconds:number|null;p95JobSeconds:number|null;
  throughputPerHour:number;robotUtilization:number;trafficWaitSeconds:number;
  energyConsumedKwh:number;chargedEnergyKwh:number;chargingSeconds:number;
  chargerWaitSeconds:number;chargeCount:number;minSocObserved:number;
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
 const floor=scenario.facility.floors.find(item=>item.id===source.floorId)!;
 const declaredChargers=floor.objects.filter(item=>item.kind==='charger'&&item.capacity>0);
 const chargers=declaredChargers.map(charger=>{
  const routeToCharger=planScenarioRoute({scenario,floorId:source.floorId,startObjectId:source.objectId,endObjectId:charger.id,robotId:robotSpec.id,safetyClearanceMeters:options.safetyClearanceMeters});
  if(!routeToCharger)return null;
  return {charger,routeToCharger,routeToSource:reverseRoute(routeToCharger)};
 }).filter((item):item is NonNullable<typeof item>=>item!==null);
 const kinematics={
  maxSpeedMps:robotSpec.kinematics.maxSpeedMps,
  accelerationMps2:robotSpec.kinematics.accelerationMps2,
  decelerationMps2:robotSpec.kinematics.decelerationMps2,
 };
 const loadedMotionSeconds=routeDuration(route,kinematics);
 const returnMotionSeconds=routeDuration(returnRoute,kinematics);
 const loadedEnergyWh=motionEnergyWh(route.distanceMeters,robotSpec.battery);
 const returnEnergyWh=motionEnergyWh(returnRoute.distanceMeters,robotSpec.battery);
 const cycleEnergyWh=loadedEnergyWh+returnEnergyWh;
 const reserveWh=robotSpec.battery.capacityWh*robotSpec.battery.minSoc;
 const chargerAccess=chargers.map(item=>({
  ...item,travelSeconds:routeDuration(item.routeToCharger,kinematics),returnSeconds:routeDuration(item.routeToSource,kinematics),
  travelWh:motionEnergyWh(item.routeToCharger.distanceMeters,robotSpec.battery),
  returnWh:motionEnergyWh(item.routeToSource.distanceMeters,robotSpec.battery),
 }));
 const minimumChargerRoundTripWh=chargerAccess.length?Math.min(...chargerAccess.map(item=>item.travelWh+item.returnWh)):0;
 const requiredFullEnergyWh=cycleEnergyWh+reserveWh+minimumChargerRoundTripWh;
 if(requiredFullEnergyWh>robotSpec.battery.capacityWh+EPS)
  throw new Error('Battery capacity cannot support one safe transport cycle and charger access while preserving minimum SOC.');
 const horizon=scenario.workload.shiftHours*3600;
 const taskArrivals=arrivals(scenario,horizon);
 const tasks=taskArrivals.map((arrival,index):Task=>({id:'T'+(index+1),arrival}));
 const robots=Array.from({length:robotSpec.fleetSize},(_,index):RobotState=>({
  id:robotSpec.id+'#'+(index+1),busy:false,busyStartedAt:null,energyWh:robotSpec.battery.capacityWh,
 }));
 const traffic=new ReservationTable(),chargerReservations=new ReservationTable();
 const trafficResource='traffic:'+source.floorId;
 const pending:Task[]=[];let pendingHead=0,assigned=0,completed=0,busySeconds=0,trafficWaitSeconds=0;
 let energyConsumedWh=0,chargedEnergyWh=0,chargingSeconds=0,chargerWaitSeconds=0,chargeCount=0,minSocObserved=1,chargeSequence=0;
 const queueWaits:number[]=[],jobSeconds:number[]=[];
 type RawTraceEvent=Parameters<typeof parseEventTrace>[0] extends never?never:Record<string,unknown>;
 const traceRecords:{event:RawTraceEvent;order:number}[]=[];let traceOrder=0;
 const push=(event:RawTraceEvent)=>{
  if(traceRecords.length>=1_000_000)throw new RangeError('EventTrace event limit exceeded');
  traceRecords.push({event,order:traceOrder++});
 };
 const addRouteMotion=(motionRoute:NavigationRoute,startTime:number,resourceId:string,idPrefix:string,taskId:string|undefined,motionKind:'loaded'|'empty')=>{
  if(startTime>horizon+EPS)return;
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
 const consumeEnergy=(robot:RobotState,wh:number)=>{
  if(!Number.isFinite(wh)||wh<0)throw new RangeError('Consumed energy must be finite and nonnegative');
  robot.energyWh-=wh;energyConsumedWh+=wh;
  if(robot.energyWh<reserveWh-EPS)throw new Error('Robot battery fell below configured minimum SOC reserve.');
  minSocObserved=Math.min(minSocObserved,robot.energyWh/robotSpec.battery.capacityWh);
 };
 const minimumChargerTravelWh=chargerAccess.length?Math.min(...chargerAccess.map(item=>item.travelWh)):0;
 const canRunSafeCycle=(robot:RobotState)=>{
  const after=robot.energyWh-cycleEnergyWh;
  return after>=reserveWh+(chargerAccess.length?minimumChargerTravelWh:0)-EPS;
 };
 const startCharging=(robot:RobotState,now:number,schedule:(event:DesEvent<SimPayload>)=>void):boolean=>{
  if(!chargerAccess.length)return false;
  const sequence=++chargeSequence;
  let best:{
   access:(typeof chargerAccess)[number];trafficPreview:Reservation;channelPreview:Reservation;channelId:string;score:number;
  }|null=null;
  for(const access of chargerAccess){
   if(robot.energyWh-access.travelWh<reserveWh-EPS)continue;
   if(robotSpec.battery.capacityWh-access.returnWh-cycleEnergyWh<reserveWh+minimumChargerTravelWh-EPS)continue;
   const trafficPreview=traffic.preview({
    resourceId:trafficResource,ownerId:robot.id,earliestStart:now,duration:access.travelSeconds,
   });
   const energyAtCharger=robot.energyWh-access.travelWh;
   const chargeSeconds=chargeDurationSeconds({fromWh:energyAtCharger,toWh:robotSpec.battery.capacityWh,chargeW:robotSpec.battery.chargeW});
   if(chargeSeconds<=EPS)continue;
   for(let channel=1;channel<=access.charger.capacity;channel++){
    const channelId='charger:'+access.charger.id+'#'+channel;
    const channelPreview=chargerReservations.preview({
     resourceId:channelId,ownerId:robot.id,earliestStart:trafficPreview.end,duration:chargeSeconds,
    });
    const score=channelPreview.end+access.returnSeconds;
    if(!best||score<best.score-EPS||(Math.abs(score-best.score)<=EPS&&channelId<best.channelId))
     best={access,trafficPreview,channelPreview,channelId,score};
   }
  }
  if(!best)return false;
  const trafficReservation=traffic.reserve({
   resourceId:trafficResource,ownerId:robot.id,earliestStart:now,duration:best.access.travelSeconds,
  });
  const energyAtCharger=robot.energyWh-best.access.travelWh;
  const chargeSeconds=chargeDurationSeconds({fromWh:energyAtCharger,toWh:robotSpec.battery.capacityWh,chargeW:robotSpec.battery.chargeW});
  const channelReservation=chargerReservations.reserve({
   resourceId:best.channelId,ownerId:robot.id,earliestStart:trafficReservation.end,duration:chargeSeconds,
  });
  const trafficWait=Math.max(0,Math.min(horizon,trafficReservation.start)-now);trafficWaitSeconds+=trafficWait;
  if(trafficReservation.waitSeconds>0)push({
   id:'charge-'+sequence+'-traffic-out',t:now,type:'traffic.conflict',resourceId:robot.id,
   data:{waitSeconds:trafficWait,reservedStart:trafficReservation.start,resource:trafficResource},
  });
  const chargerWait=Math.max(0,Math.min(horizon,channelReservation.start)-Math.min(horizon,trafficReservation.end));
  chargerWaitSeconds+=chargerWait;
  const chargedOverlap=Math.max(0,Math.min(horizon,channelReservation.end)-Math.min(horizon,channelReservation.start));
  chargingSeconds+=chargedOverlap;
  chargedEnergyWh+=chargedOverlap*robotSpec.battery.chargeW/3600;
  const plan:ChargePlan={
   sequence,chargerId:best.access.charger.id,channelId:best.channelId,
   routeToCharger:best.access.routeToCharger,routeToSource:best.access.routeToSource,
   travelWh:best.access.travelWh,returnWh:best.access.returnWh,
   traffic:trafficReservation,channel:channelReservation,
  };
  addRouteMotion(plan.routeToCharger,trafficReservation.start,robot.id,'charge-'+sequence+'-'+robot.id+'-out',undefined,'empty');
  schedule({at:trafficReservation.end,priority:0,payload:{kind:'chargerArrive',robot,plan}});
  return true;
 };
 const dispatch=(now:number,schedule:(event:DesEvent<SimPayload>)=>void)=>{
  while(pendingHead<pending.length){
   const available=robots.filter(item=>!item.busy);if(!available.length)break;
   const capable=available.find(canRunSafeCycle);
   if(capable){
    const task=pending[pendingHead++];capable.busy=true;capable.busyStartedAt=now;assigned++;
    const wait=now-task.arrival;queueWaits.push(wait);
    push({id:task.id+'-assigned',t:now,type:'task.assigned',taskId:task.id,resourceId:capable.id,data:{queueSeconds:wait,soc:capable.energyWh/robotSpec.battery.capacityWh}});
    push({id:task.id+'-load-start',t:now,type:'process.started',taskId:task.id,resourceId:source.objectId,data:{phase:'loading'}});
    schedule({at:now+robotSpec.handling.loadSeconds,priority:0,payload:{kind:'loadDone',task,robot:capable}});
    continue;
   }
   let chargingStarted=false;
   for(const robot of available){
    robot.busy=true;robot.busyStartedAt=now;
    if(startCharging(robot,now,schedule)){chargingStarted=true;continue;}
    robot.busy=false;robot.busyStartedAt=null;
   }
   if(!chargingStarted)break;
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
   const reservation=traffic.reserve({resourceId:trafficResource,ownerId:payload.robot.id,earliestStart:now,duration:loadedMotionSeconds});
   const horizonWait=Math.max(0,Math.min(horizon,reservation.start)-now);trafficWaitSeconds+=horizonWait;
   if(reservation.waitSeconds>0)push({id:payload.task.id+'-traffic-loaded',t:now,type:'traffic.conflict',taskId:payload.task.id,resourceId:payload.robot.id,data:{waitSeconds:horizonWait,reservedStart:reservation.start,resource:trafficResource}});
   addRouteMotion(route,reservation.start,payload.robot.id,payload.task.id+'-'+payload.robot.id+'-loaded',payload.task.id,'loaded');
   schedule({at:reservation.end,priority:0,payload:{kind:'loadedMotionDone',task:payload.task,robot:payload.robot}});
   return;
  }
  if(payload.kind==='loadedMotionDone'){
   consumeEnergy(payload.robot,loadedEnergyWh);
   push({id:payload.task.id+'-unload-start',t:now,type:'process.started',taskId:payload.task.id,resourceId:sink.objectId,data:{phase:'unloading',soc:payload.robot.energyWh/robotSpec.battery.capacityWh}});
   schedule({at:now+robotSpec.handling.unloadSeconds,priority:0,payload:{kind:'unloadDone',task:payload.task,robot:payload.robot}});
   return;
  }
  if(payload.kind==='unloadDone'){
   push({id:payload.task.id+'-unload-complete',t:now,type:'process.completed',taskId:payload.task.id,resourceId:sink.objectId,data:{phase:'unloading'}});
   push({id:payload.task.id+'-completed',t:now,type:'task.completed',taskId:payload.task.id,resourceId:payload.robot.id});
   completed++;jobSeconds.push(now-payload.task.arrival);
   const reservation=traffic.reserve({resourceId:trafficResource,ownerId:payload.robot.id,earliestStart:now,duration:returnMotionSeconds});
   const horizonWait=Math.max(0,Math.min(horizon,reservation.start)-now);trafficWaitSeconds+=horizonWait;
   if(reservation.waitSeconds>0)push({id:payload.task.id+'-traffic-empty',t:now,type:'traffic.conflict',resourceId:payload.robot.id,data:{waitSeconds:horizonWait,reservedStart:reservation.start,resource:trafficResource}});
   addRouteMotion(returnRoute,reservation.start,payload.robot.id,payload.task.id+'-'+payload.robot.id+'-empty',undefined,'empty');
   schedule({at:reservation.end,priority:0,payload:{kind:'returnDone',robot:payload.robot}});
   return;
  }
  if(payload.kind==='returnDone'){
   consumeEnergy(payload.robot,returnEnergyWh);
   if(payload.robot.busyStartedAt!==null)busySeconds+=now-payload.robot.busyStartedAt;
   payload.robot.busy=false;payload.robot.busyStartedAt=null;dispatch(now,schedule);return;
  }
  if(payload.kind==='chargerArrive'){
   consumeEnergy(payload.robot,payload.plan.travelWh);
   if(payload.plan.channel.start>now+EPS){
    push({id:'charge-'+payload.plan.sequence+'-wait',t:now,type:'robot.waiting',resourceId:payload.robot.id,data:{reason:'charger',chargerId:payload.plan.chargerId,channelId:payload.plan.channelId,waitSeconds:payload.plan.channel.start-now}});
   }
   schedule({at:payload.plan.channel.start,priority:0,payload:{kind:'chargeStart',robot:payload.robot,plan:payload.plan}});return;
  }
  if(payload.kind==='chargeStart'){
   chargeCount++;
   push({id:'charge-'+payload.plan.sequence+'-start',t:now,type:'robot.charging',resourceId:payload.robot.id,data:{phase:'started',chargerId:payload.plan.chargerId,channelId:payload.plan.channelId,soc:payload.robot.energyWh/robotSpec.battery.capacityWh}});
   schedule({at:payload.plan.channel.end,priority:0,payload:{kind:'chargeDone',robot:payload.robot,plan:payload.plan}});return;
  }
  if(payload.kind==='chargeDone'){
   const gained=robotSpec.battery.capacityWh-payload.robot.energyWh;
   payload.robot.energyWh=robotSpec.battery.capacityWh;
   push({id:'charge-'+payload.plan.sequence+'-complete',t:now,type:'robot.charging',resourceId:payload.robot.id,data:{phase:'completed',chargerId:payload.plan.chargerId,channelId:payload.plan.channelId,chargedWh:gained,soc:1}});
   const returnSeconds=routeDuration(payload.plan.routeToSource,kinematics);
   const reservation=traffic.reserve({resourceId:trafficResource,ownerId:payload.robot.id,earliestStart:now,duration:returnSeconds});
   const horizonWait=Math.max(0,Math.min(horizon,reservation.start)-now);trafficWaitSeconds+=horizonWait;
   if(reservation.waitSeconds>0)push({id:'charge-'+payload.plan.sequence+'-traffic-return',t:now,type:'traffic.conflict',resourceId:payload.robot.id,data:{waitSeconds:horizonWait,reservedStart:reservation.start,resource:trafficResource}});
   addRouteMotion(payload.plan.routeToSource,reservation.start,payload.robot.id,'charge-'+payload.plan.sequence+'-'+payload.robot.id+'-return',undefined,'empty');
   schedule({at:reservation.end,priority:0,payload:{kind:'chargeReturnDone',robot:payload.robot,plan:payload.plan}});return;
  }
  consumeEnergy(payload.robot,payload.plan.returnWh);
  if(payload.robot.busyStartedAt!==null)busySeconds+=now-payload.robot.busyStartedAt;
  payload.robot.busy=false;payload.robot.busyStartedAt=null;dispatch(now,schedule);
 });
 for(const robot of robots)if(robot.busyStartedAt!==null)busySeconds+=Math.max(0,horizon-robot.busyStartedAt);
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
   trafficWaitSeconds,energyConsumedKwh:energyConsumedWh/1000,chargedEnergyKwh:chargedEnergyWh/1000,
   chargingSeconds,chargerWaitSeconds,chargeCount,minSocObserved,
  },
  warnings:[
   'simcore-fleet/1 uses FCFS dispatch and a return-to-source policy.',
   'Traffic uses a conservative exclusive-corridor reservation token; segment-level MAPF is not modeled yet.',
   'Charging uses constant power and declared charger capacity; nonlinear charging curves and auxiliary/idle power are not modeled yet.',
   'Energy consumed by a motion that is still unfinished at the simulation horizon is excluded from the aggregate energy KPI.',
   'Failures and continuous cornering are not modeled in this runner yet.',
  ],
 };
}
