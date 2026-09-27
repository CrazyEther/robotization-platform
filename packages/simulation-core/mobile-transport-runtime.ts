import type {SimulationScenarioV2} from './contracts';
import {chargeDurationSeconds,motionEnergyWh} from './energy';
import {ChargingScheduler,type ChargingSlot} from './charging';
import {generateLinearMotionEvents,planRestToRestMotion} from './motion';
import {planScenarioRoute,type NavigationRoute} from './navigation';
import {ReservationTable} from './traffic';
import {compileTransportNetwork,type TransportLeg} from './transport-network';

export type MobileTransportEvent=
 | {kind:'mobile-transport-complete';taskId:string;edgeId:string;robotId:string;distanceMeters:number;energyWh:number}
 | {kind:'mobile-charge-arrive';sequence:number;robotId:string;chargerId:string;distanceMeters:number;travelEnergyWh:number;slot:ChargingSlot}
 | {kind:'mobile-charge-start';sequence:number;robotId:string;chargerId:string;slot:ChargingSlot}
 | {kind:'mobile-charge-done';sequence:number;robotId:string;chargerId:string;slot:ChargingSlot};
type Request={taskId:string;edgeId:string;enteredAt:number};
type RobotState={id:string;busy:boolean;currentObjectId:string;energyWh:number};
type Emit=(event:Record<string,unknown>)=>void;
type Schedule=(at:number,payload:MobileTransportEvent)=>void;

export type MobileTransportMetrics={
 distanceMeters:number;energyKwh:number;waitSeconds:number;meanWaitSeconds:number;trafficWaitSeconds:number;
 busySeconds:number;robotUtilization:number;minSocObserved:number;startedRequests:number;
 chargeCount:number;chargingSeconds:number;chargerWaitSeconds:number;chargedEnergyKwh:number;
};

const EPS=1e-9;

const routeMotionSeconds=(route:NavigationRoute,robot:SimulationScenarioV2['robots'][number])=>{
 let total=0;
 for(let index=0;index<route.points.length-1;index++){
  const a=route.points[index],b=route.points[index+1];
  const distance=Math.hypot(b.x-a.x,b.y-a.y);
  if(distance<=EPS)continue;
  total+=planRestToRestMotion(distance,{
   maxSpeedMps:robot.kinematics.maxSpeedMps,
   accelerationMps2:robot.kinematics.accelerationMps2,
   decelerationMps2:robot.kinematics.decelerationMps2,
  }).totalSeconds;
 }
 return total;
};
const locateFloor=(scenario:SimulationScenarioV2,objectId:string)=>{
 for(const floor of scenario.facility.floors)if(floor.objects.some(object=>object.id===objectId))return floor.id;
 throw new Error('Transport runtime cannot locate facility object: '+objectId);
};

export class MobileTransportRuntime{
 private readonly robotSpec:SimulationScenarioV2['robots'][number];
 private readonly legs=new Map<string,TransportLeg>();
 private readonly robots:RobotState[];
 private readonly queue:Request[]=[];
 private readonly traffic=new ReservationTable();
 private readonly charging=new ChargingScheduler();
 private distanceMeters=0;private energyWh=0;private waitSeconds=0;private trafficWaitSeconds=0;private busySeconds=0;private minSocObserved=1;private startedRequests=0;
 private chargeCount=0;private chargingSeconds=0;private chargerWaitSeconds=0;private chargedEnergyWh=0;private chargeSequence=0;

 constructor(
  private readonly scenario:SimulationScenarioV2,
  private readonly options:{robotId:string;safetyClearanceMeters:number;samplePeriodSeconds:number},
  private readonly horizon:number,
  private readonly emit:Emit,
 ){
  if(!Number.isFinite(options.samplePeriodSeconds)||options.samplePeriodSeconds<=0)
   throw new RangeError('Transport samplePeriodSeconds must be finite and > 0');
  const network=compileTransportNetwork(scenario,options.robotId,{safetyClearanceMeters:options.safetyClearanceMeters});
  if(!network.legs.length)throw new Error('Mobile transport runtime requires at least one transport edge.');
  network.legs.forEach(leg=>this.legs.set(leg.edgeId,leg));
  const robot=scenario.robots.find(item=>item.id===options.robotId);
  if(!robot)throw new Error('Unknown transport robot: '+options.robotId);
  this.robotSpec=robot;
  const home=network.legs[0].fromObjectId;
  this.robots=Array.from({length:robot.fleetSize},(_,index)=>({
   id:robot.id+'#'+(index+1),busy:false,currentObjectId:home,energyWh:robot.battery.capacityWh,
  }));
 }

 request(taskId:string,edgeId:string,now:number,schedule:Schedule){
  if(!this.legs.has(edgeId))throw new Error('Unknown compiled transport edge: '+edgeId);
  this.queue.push({taskId,edgeId,enteredAt:now});
  this.dispatch(now,schedule);
 }

 handle(event:MobileTransportEvent,now:number,schedule:Schedule):{taskId:string;edgeId:string}|null{
  const robot=this.robots.find(item=>item.id===event.robotId);
  if(!robot)throw new Error('Unknown transport robot instance: '+event.robotId);
  if(event.kind==='mobile-transport-complete'){
   const leg=this.legs.get(event.edgeId);
   if(!leg)throw new Error('Unknown completed transport edge: '+event.edgeId);
   this.consumeEnergy(robot,event.energyWh);
   robot.currentObjectId=leg.toObjectId;robot.busy=false;
   this.distanceMeters+=event.distanceMeters;
   this.emit({id:event.taskId+'-'+event.edgeId+'-transport-complete',t:now,type:'process.completed',
    taskId:event.taskId,resourceId:robot.id,data:{phase:'transport',edgeId:event.edgeId}});
   this.dispatch(now,schedule);
   return {taskId:event.taskId,edgeId:event.edgeId};
  }
  if(event.kind==='mobile-charge-arrive'){
   this.consumeEnergy(robot,event.travelEnergyWh);this.distanceMeters+=event.distanceMeters;
   robot.currentObjectId=event.chargerId;
   if(event.slot.start>now+EPS)this.emit({id:'charge-'+event.sequence+'-'+robot.id+'-wait',t:now,
    type:'robot.waiting',resourceId:robot.id,data:{reason:'charger',chargerId:event.chargerId,
     channelId:event.slot.channelId,waitSeconds:event.slot.start-now}});
   schedule(event.slot.start,{kind:'mobile-charge-start',sequence:event.sequence,robotId:robot.id,chargerId:event.chargerId,slot:event.slot});
   return null;
  }
  if(event.kind==='mobile-charge-start'){
   this.emit({id:'charge-'+event.sequence+'-'+robot.id+'-start',t:now,type:'robot.charging',resourceId:robot.id,
    data:{phase:'started',chargerId:event.chargerId,channelId:event.slot.channelId,
     soc:robot.energyWh/this.robotSpec.battery.capacityWh}});
   schedule(event.slot.end,{kind:'mobile-charge-done',sequence:event.sequence,robotId:robot.id,chargerId:event.chargerId,slot:event.slot});
   return null;
  }
  const gained=this.robotSpec.battery.capacityWh-robot.energyWh;
  robot.energyWh=this.robotSpec.battery.capacityWh;robot.busy=false;
  this.emit({id:'charge-'+event.sequence+'-'+robot.id+'-complete',t:now,type:'robot.charging',resourceId:robot.id,
   data:{phase:'completed',chargerId:event.chargerId,channelId:event.slot.channelId,chargedWh:gained,soc:1}});
  this.dispatch(now,schedule);
  return null;
 }

 metrics():MobileTransportMetrics{
  return {
   distanceMeters:this.distanceMeters,energyKwh:this.energyWh/1000,waitSeconds:this.waitSeconds,
   meanWaitSeconds:this.startedRequests?this.waitSeconds/this.startedRequests:0,
   trafficWaitSeconds:this.trafficWaitSeconds,busySeconds:this.busySeconds,
   robotUtilization:this.horizon>0?this.busySeconds/(this.robots.length*this.horizon):0,
   minSocObserved:this.minSocObserved,startedRequests:this.startedRequests,
   chargeCount:this.chargeCount,chargingSeconds:this.chargingSeconds,
   chargerWaitSeconds:this.chargerWaitSeconds,chargedEnergyKwh:this.chargedEnergyWh/1000,
  };
 }

 private consumeEnergy(robot:RobotState,wh:number){
  if(!Number.isFinite(wh)||wh<0)throw new RangeError('Consumed robot energy must be finite and nonnegative.');
  robot.energyWh-=wh;this.energyWh+=wh;
  const reserve=this.robotSpec.battery.capacityWh*this.robotSpec.battery.minSoc;
  if(robot.energyWh<reserve-EPS)throw new Error('Integrated transport violated minimum robot SOC reserve.');
  this.minSocObserved=Math.min(this.minSocObserved,robot.energyWh/this.robotSpec.battery.capacityWh);
 }

 private routeBetween(startObjectId:string,endObjectId:string){
  const floorId=locateFloor(this.scenario,startObjectId);
  if(locateFloor(this.scenario,endObjectId)!==floorId)return null;
  if(startObjectId===endObjectId)return {route:null,floorId,distanceMeters:0,motionSeconds:0,energyWh:0};
  const route=planScenarioRoute({
   scenario:this.scenario,floorId,startObjectId,endObjectId,
   robotId:this.robotSpec.id,safetyClearanceMeters:this.options.safetyClearanceMeters,
  });
  if(!route)return null;
  return {
   route,floorId,distanceMeters:route.distanceMeters,motionSeconds:routeMotionSeconds(route,this.robotSpec),
   energyWh:motionEnergyWh(route.distanceMeters,this.robotSpec.battery),
  };
 }

 private reposition(robot:RobotState,leg:TransportLeg){
  return this.routeBetween(robot.currentObjectId,leg.fromObjectId);
 }

 private chargersFrom(objectId:string){
  const floorId=locateFloor(this.scenario,objectId);
  const floor=this.scenario.facility.floors.find(item=>item.id===floorId)!;
  return floor.objects.filter(object=>object.kind==='charger'&&object.capacity>0);
 }

 private escapeEnergyWh(objectId:string):number{
  const chargers=this.chargersFrom(objectId);
  if(!chargers.length)return 0;
  const reachable=chargers.map(charger=>this.routeBetween(objectId,charger.id))
   .filter((route):route is NonNullable<typeof route>=>route!==null);
  if(!reachable.length)return Infinity;
  return Math.min(...reachable.map(route=>route.energyWh));
 }

 private addMotion(route:NavigationRoute,start:number,floorId:string,robotId:string,idPrefix:string,taskId:string|undefined,motionRole:string){
  let cursor=start;
  for(let index=0;index<route.points.length-1;index++){
   const a=route.points[index],b=route.points[index+1];
   const distance=Math.hypot(b.x-a.x,b.y-a.y);
   if(distance<=EPS)continue;
   const events=generateLinearMotionEvents({
    idPrefix:idPrefix+'-'+index,resourceId:robotId,floorId,
    start:a,end:b,startTimeSeconds:cursor,samplePeriodSeconds:this.options.samplePeriodSeconds,
    kinematics:{maxSpeedMps:this.robotSpec.kinematics.maxSpeedMps,
     accelerationMps2:this.robotSpec.kinematics.accelerationMps2,decelerationMps2:this.robotSpec.kinematics.decelerationMps2},
   });
   for(const event of events)if(event.t<=this.horizon+EPS)
    this.emit({...event,...(taskId?{taskId}:{}),data:{...event.data,motionRole}});
   cursor+=planRestToRestMotion(distance,{
    maxSpeedMps:this.robotSpec.kinematics.maxSpeedMps,
    accelerationMps2:this.robotSpec.kinematics.accelerationMps2,
    decelerationMps2:this.robotSpec.kinematics.decelerationMps2,
   }).totalSeconds;
  }
 }

 private startCharging(robot:RobotState,leg:TransportLeg,now:number,schedule:Schedule):boolean{
  const reserveWh=this.robotSpec.battery.capacityWh*this.robotSpec.battery.minSoc;
  const escapeAfterTask=this.escapeEnergyWh(leg.toObjectId);
  if(!Number.isFinite(escapeAfterTask))return false;
  const choices=this.chargersFrom(robot.currentObjectId).flatMap(charger=>{
   const travel=this.routeBetween(robot.currentObjectId,charger.id);
   const postCharge=this.routeBetween(charger.id,leg.fromObjectId);
   if(!travel||!postCharge||robot.energyWh-travel.energyWh<reserveWh-EPS)return [];
   if(this.robotSpec.battery.capacityWh-postCharge.energyWh-leg.energyWh<reserveWh+escapeAfterTask-EPS)return [];
   const trafficPreview=travel.motionSeconds>EPS?this.traffic.preview({
    resourceId:'traffic:'+travel.floorId,ownerId:robot.id,earliestStart:now,duration:travel.motionSeconds,
   }):null;
   const arrivalTime=trafficPreview?.end??now;
   const energyAtCharger=robot.energyWh-travel.energyWh;
   const chargeSeconds=chargeDurationSeconds({
    fromWh:energyAtCharger,toWh:this.robotSpec.battery.capacityWh,chargeW:this.robotSpec.battery.chargeW,
   });
   if(chargeSeconds<=EPS)return [];
   return [{charger,travel,postCharge,arrivalTime,chargeSeconds}];
  });
  if(!choices.length)return false;
  const preview=this.charging.previewBest(robot.id,choices.map(choice=>({
   chargerId:choice.charger.id,capacity:choice.charger.capacity,arrivalTime:choice.arrivalTime,
   chargeSeconds:choice.chargeSeconds,postChargeSeconds:choice.postCharge.motionSeconds+leg.motionSeconds,
  })));
  const selected=choices.find(choice=>choice.charger.id===preview.chargerId)!;
  let arrival=now;
  if(selected.travel.route&&selected.travel.motionSeconds>EPS){
   const reservation=this.traffic.reserve({
    resourceId:'traffic:'+selected.travel.floorId,ownerId:robot.id,earliestStart:now,duration:selected.travel.motionSeconds,
   });
   const wait=Math.max(0,Math.min(this.horizon,reservation.start)-now);this.trafficWaitSeconds+=wait;
   if(wait>EPS)this.emit({id:'charge-'+(this.chargeSequence+1)+'-'+robot.id+'-traffic-wait',t:now,
    type:'robot.waiting',resourceId:robot.id,data:{reason:'traffic',waitSeconds:wait}});
   this.addMotion(selected.travel.route,reservation.start,selected.travel.floorId,robot.id,
    'charge-'+(this.chargeSequence+1)+'-'+robot.id+'-travel',undefined,'charge-travel');
   arrival=reservation.end;
  }
  const slot=this.charging.reserveBest(robot.id,[{
   chargerId:selected.charger.id,capacity:selected.charger.capacity,arrivalTime:arrival,
   chargeSeconds:selected.chargeSeconds,postChargeSeconds:selected.postCharge.motionSeconds+leg.motionSeconds,
  }]);
  const sequence=++this.chargeSequence;robot.busy=true;
  const chargerWait=Math.max(0,Math.min(this.horizon,slot.start)-Math.min(this.horizon,arrival));
  const chargingOverlap=Math.max(0,Math.min(this.horizon,slot.end)-Math.min(this.horizon,slot.start));
  this.chargerWaitSeconds+=chargerWait;this.chargingSeconds+=chargingOverlap;
  this.chargedEnergyWh+=chargingOverlap*this.robotSpec.battery.chargeW/3600;
  if(slot.start<=this.horizon+EPS)this.chargeCount++;
  this.busySeconds+=Math.max(0,Math.min(this.horizon,slot.end)-now);
  schedule(arrival,{kind:'mobile-charge-arrive',sequence,robotId:robot.id,chargerId:selected.charger.id,
   distanceMeters:selected.travel.distanceMeters,travelEnergyWh:selected.travel.energyWh,slot});
  return true;
 }

 private dispatch(now:number,schedule:Schedule){
  while(this.queue.length){
   const free=this.robots.filter(robot=>!robot.busy);
   if(!free.length)return;
   const request=this.queue[0],leg=this.legs.get(request.edgeId)!;
   const reserveWh=this.robotSpec.battery.capacityWh*this.robotSpec.battery.minSoc;
   const escapeAfterTask=this.escapeEnergyWh(leg.toObjectId);
   const candidates=free.map(robot=>{
    const reposition=this.reposition(robot,leg);
    if(!reposition||!Number.isFinite(escapeAfterTask))return null;
    const totalEnergyWh=reposition.energyWh+leg.energyWh;
    if(robot.energyWh-totalEnergyWh<reserveWh+escapeAfterTask-EPS)return null;
    return {robot,reposition,totalEnergyWh};
   }).filter((item):item is NonNullable<typeof item>=>item!==null)
    .sort((a,b)=>a.reposition.motionSeconds-b.reposition.motionSeconds||a.robot.id.localeCompare(b.robot.id));
   if(!candidates.length){
    const chargingRobot=free.find(robot=>this.startCharging(robot,leg,now,schedule));
    if(chargingRobot)return;
    if(free.length===this.robots.length)
     throw new Error('No available robot can safely execute transport edge '+request.edgeId+' or reach a usable charger with current battery/SOC.');
    return;
   }
   this.queue.shift();
   const {robot,reposition,totalEnergyWh}=candidates[0];
   this.startedRequests++;
   robot.busy=true;
   const queueWait=now-request.enteredAt;this.waitSeconds+=queueWait;
   let cursor=now;const totalDistance=reposition.distanceMeters+leg.distanceMeters;

   if(reposition.route&&reposition.motionSeconds>EPS){
    const floorId=locateFloor(this.scenario,robot.currentObjectId);
    const reservation=this.traffic.reserve({
     resourceId:'traffic:'+floorId,ownerId:robot.id,earliestStart:cursor,duration:reposition.motionSeconds,
    });
    this.trafficWaitSeconds+=reservation.waitSeconds;
    if(reservation.waitSeconds>EPS)this.emit({
     id:request.taskId+'-'+request.edgeId+'-'+robot.id+'-reposition-wait',t:cursor,type:'robot.waiting',
     taskId:request.taskId,resourceId:robot.id,data:{reason:'traffic',waitSeconds:reservation.waitSeconds},
    });
    this.addMotion(reposition.route,reservation.start,floorId,robot.id,
     request.taskId+'-'+request.edgeId+'-'+robot.id+'-reposition',request.taskId,'reposition');
    cursor=reservation.end;
   }
   cursor+=this.robotSpec.handling.loadSeconds;
   const loadedReservation=this.traffic.reserve({
    resourceId:'traffic:'+leg.floorId,ownerId:robot.id,earliestStart:cursor,duration:leg.motionSeconds,
   });
   this.trafficWaitSeconds+=loadedReservation.waitSeconds;
   if(loadedReservation.waitSeconds>EPS)this.emit({
    id:request.taskId+'-'+request.edgeId+'-'+robot.id+'-loaded-wait',t:cursor,type:'robot.waiting',
    taskId:request.taskId,resourceId:robot.id,data:{reason:'traffic',waitSeconds:loadedReservation.waitSeconds},
   });

   this.addMotion(leg.route,loadedReservation.start,leg.floorId,robot.id,
    request.taskId+'-'+request.edgeId+'-'+robot.id+'-loaded',request.taskId,'loaded');
   const completeAt=loadedReservation.end+this.robotSpec.handling.unloadSeconds;
   this.busySeconds+=Math.max(0,Math.min(this.horizon,completeAt)-now);
   this.emit({id:request.taskId+'-'+request.edgeId+'-transport-start',t:now,type:'process.started',
    taskId:request.taskId,resourceId:robot.id,
    data:{phase:'transport',edgeId:request.edgeId,queueSeconds:queueWait}});
   schedule(completeAt,{
    kind:'mobile-transport-complete',taskId:request.taskId,edgeId:request.edgeId,robotId:robot.id,
    distanceMeters:totalDistance,energyWh:totalEnergyWh,
   });
  }
 }
}
