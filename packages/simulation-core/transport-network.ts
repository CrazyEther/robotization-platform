import type {SimulationScenarioV2} from './contracts';
import {motionEnergyWh} from './energy';
import {planRestToRestMotion} from './motion';
import {planScenarioRoute,type NavigationRoute} from './navigation';

export type TransportLeg={
 edgeId:string;fromNodeId:string;toNodeId:string;
 fromObjectId:string;toObjectId:string;floorId:string;
 route:NavigationRoute;distanceMeters:number;motionSeconds:number;energyWh:number;
};
export type TransportNetwork={
 robotId:string;planner:'native-visibility/1';legs:TransportLeg[];
};

const routeMotionSeconds=(route:NavigationRoute,robot:SimulationScenarioV2['robots'][number])=>{
 let total=0;
 for(let index=0;index<route.points.length-1;index++){
  const a=route.points[index],b=route.points[index+1];
  const distance=Math.hypot(b.x-a.x,b.y-a.y);
  if(distance<=1e-9)continue;
  total+=planRestToRestMotion(distance,{
   maxSpeedMps:robot.kinematics.maxSpeedMps,
   accelerationMps2:robot.kinematics.accelerationMps2,
   decelerationMps2:robot.kinematics.decelerationMps2,
  }).totalSeconds;
 }
 return total;
};

const locateObject=(scenario:SimulationScenarioV2,objectId:string)=>{
 for(const floor of scenario.facility.floors){
  if(floor.objects.some(object=>object.id===objectId))return {floorId:floor.id,objectId};
 }
 throw new Error('Transport endpoint facility object is missing: '+objectId);
};

export function compileTransportNetwork(
 scenario:SimulationScenarioV2,
 robotId:string,
 options:{safetyClearanceMeters:number},
):TransportNetwork{
 const robot=scenario.robots.find(item=>item.id===robotId);
 if(!robot)throw new Error('Unknown robot: '+robotId);
 const nodes=new Map(scenario.process.nodes.map(node=>[node.id,node] as const));
 const legs:TransportLeg[]=[];
 for(const edge of scenario.process.edges){
  if(edge.mode!=='transport')continue;
  const from=nodes.get(edge.from),to=nodes.get(edge.to);
  if(!from||!to)throw new Error('Transport edge references an unknown process node: '+edge.id);
  if(!from.facilityObjectId||!to.facilityObjectId)
   throw new Error('Transport edge endpoints require facility locations: '+edge.id);
  const fromLocation=locateObject(scenario,from.facilityObjectId);
  const toLocation=locateObject(scenario,to.facilityObjectId);
  if(fromLocation.floorId!==toLocation.floorId)
   throw new Error('Transport edge crosses floors; lift routing is required: '+edge.id);

  const route=planScenarioRoute({
   scenario,floorId:fromLocation.floorId,startObjectId:from.facilityObjectId,
   endObjectId:to.facilityObjectId,robotId,safetyClearanceMeters:options.safetyClearanceMeters,
  });
  if(!route)throw new Error('No footprint-clear route exists for transport edge: '+edge.id);
  const motionSeconds=routeMotionSeconds(route,robot);
  const energyWh=motionEnergyWh(route.distanceMeters,robot.battery);
  legs.push({
   edgeId:edge.id,fromNodeId:from.id,toNodeId:to.id,
   fromObjectId:from.facilityObjectId,toObjectId:to.facilityObjectId,
   floorId:fromLocation.floorId,route,distanceMeters:route.distanceMeters,motionSeconds,energyWh,
  });
 }
 return {robotId,planner:'native-visibility/1',legs};
}
