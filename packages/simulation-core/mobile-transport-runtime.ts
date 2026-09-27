import type {SimulationScenarioV2} from './contracts';
import {motionEnergyWh} from './energy';
import {generateLinearMotionEvents,planRestToRestMotion} from './motion';
import {planScenarioRoute,type NavigationRoute} from './navigation';
import {ReservationTable} from './traffic';
import {compileTransportNetwork,type TransportLeg} from './transport-network';

export type MobileTransportEvent={
 kind:'mobile-transport-complete';taskId:string;edgeId:string;robotId:string;
 distanceMeters:number;energyWh:number;
};
type Request={taskId:string;edgeId:string;enteredAt:number};
type RobotState={id:string;busy:boolean;currentObjectId:string;energyWh:number};
type Emit=(event:Record<string,unknown>)=>void;
type Schedule=(at:number,payload:MobileTransportEvent)=>void;

export type MobileTransportMetrics={
 distanceMeters:number;energyKwh:number;waitSeconds:number;meanWaitSeconds:number;trafficWaitSeconds:number;
 busySeconds:number;robotUtilization:number;minSocObserved:number;startedRequests:number;
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
 private distanceMeters=0;private energyWh=0;private waitSeconds=0;private trafficWaitSeconds=0;private busySeconds=0;private minSocObserved=1;private startedRequests=0;

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

 complete(event:MobileTransportEvent,now:number,schedule:Schedule){
  const robot=this.robots.find(item=>item.id===event.robotId);
  if(!robot)throw new Error('Unknown transport robot instance: '+event.robotId);
  const leg=this.legs.get(event.edgeId);
  if(!leg)throw new Error('Unknown completed transport edge: '+event.edgeId);
  robot.energyWh-=event.energyWh;
  const reserve=this.robotSpec.battery.capacityWh*this.robotSpec.battery.minSoc;
  if(robot.energyWh<reserve-EPS)throw new Error('Integrated transport violated minimum robot SOC reserve.');
  this.minSocObserved=Math.min(this.minSocObserved,robot.energyWh/this.robotSpec.battery.capacityWh);
  robot.currentObjectId=leg.toObjectId;robot.busy=false;
  this.distanceMeters+=event.distanceMeters;this.energyWh+=event.energyWh;
  this.emit({id:event.taskId+'-'+event.edgeId+'-transport-complete',t:now,type:'process.completed',
   taskId:event.taskId,resourceId:robot.id,data:{phase:'transport',edgeId:event.edgeId}});
  this.dispatch(now,schedule);
  return {taskId:event.taskId,edgeId:event.edgeId};
 }

 metrics():MobileTransportMetrics{
  return {
   distanceMeters:this.distanceMeters,energyKwh:this.energyWh/1000,waitSeconds:this.waitSeconds,
   meanWaitSeconds:this.startedRequests?this.waitSeconds/this.startedRequests:0,
   trafficWaitSeconds:this.trafficWaitSeconds,busySeconds:this.busySeconds,
   robotUtilization:this.horizon>0?this.busySeconds/(this.robots.length*this.horizon):0,
   minSocObserved:this.minSocObserved,startedRequests:this.startedRequests,
  };
 }

 private reposition(robot:RobotState,leg:TransportLeg){
  if(robot.currentObjectId===leg.fromObjectId)return {route:null,distanceMeters:0,motionSeconds:0,energyWh:0};
  const fromFloor=locateFloor(this.scenario,robot.currentObjectId);
  const toFloor=locateFloor(this.scenario,leg.fromObjectId);
  if(fromFloor!==toFloor)return null;
  const route=planScenarioRoute({
   scenario:this.scenario,floorId:fromFloor,startObjectId:robot.currentObjectId,endObjectId:leg.fromObjectId,
   robotId:this.robotSpec.id,safetyClearanceMeters:this.options.safetyClearanceMeters,
  });
  if(!route)return null;
  return {
   route,distanceMeters:route.distanceMeters,motionSeconds:routeMotionSeconds(route,this.robotSpec),
   energyWh:motionEnergyWh(route.distanceMeters,this.robotSpec.battery),
  };
 }

 private addMotion(route:NavigationRoute,start:number,floorId:string,robotId:string,idPrefix:string,taskId:string,motionRole:string){
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
    this.emit({...event,taskId,data:{...event.data,motionRole}});
   cursor+=planRestToRestMotion(distance,{
    maxSpeedMps:this.robotSpec.kinematics.maxSpeedMps,
    accelerationMps2:this.robotSpec.kinematics.accelerationMps2,
    decelerationMps2:this.robotSpec.kinematics.decelerationMps2,
   }).totalSeconds;
  }
 }

 private dispatch(now:number,schedule:Schedule){
  while(this.queue.length){
   const free=this.robots.filter(robot=>!robot.busy);
   if(!free.length)return;
   const request=this.queue[0],leg=this.legs.get(request.edgeId)!;
   const reserveWh=this.robotSpec.battery.capacityWh*this.robotSpec.battery.minSoc;
   const candidates=free.map(robot=>{
    const reposition=this.reposition(robot,leg);
    if(!reposition)return null;
    const totalEnergyWh=reposition.energyWh+leg.energyWh;
    if(robot.energyWh-totalEnergyWh<reserveWh-EPS)return null;
    return {robot,reposition,totalEnergyWh};
   }).filter((item):item is NonNullable<typeof item>=>item!==null)
    .sort((a,b)=>a.reposition.motionSeconds-b.reposition.motionSeconds||a.robot.id.localeCompare(b.robot.id));
   if(!candidates.length){
    if(free.length===this.robots.length)
     throw new Error('No available robot can safely reach and execute transport edge '+request.edgeId+' with current SOC.');
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
