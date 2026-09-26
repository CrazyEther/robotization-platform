import type {SimulationInput} from '../ris/contracts';
import type {SimulationScenarioV2} from './contracts';
import {compileScenario} from './compiler';

export function compileLegacyScenario(input:SimulationInput):SimulationScenarioV2{
 const obstacles=input.layout.obstacles.map((r,index)=>({
  id:'obstacle-'+(index+1),label:'Obstacle '+(index+1),kind:'obstacle' as const,
  geometry:{x:r.x,y:r.y,w:r.w,h:r.h,rotationDeg:0},blocking:true,capacity:0,properties:{},
 }));
 const stations=[
  {id:'pickup',label:'Pickup',kind:'station' as const,geometry:{x:input.layout.pickup.x,y:input.layout.pickup.y,w:.5,h:.5,rotationDeg:0},blocking:false,capacity:1,properties:{role:'pickup'}},
  {id:'dropoff',label:'Dropoff',kind:'station' as const,geometry:{x:input.layout.dropoff.x,y:input.layout.dropoff.y,w:.5,h:.5,rotationDeg:0},blocking:false,capacity:1,properties:{role:'dropoff'}},
 ];
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'legacy-'+input.sector,name:'Legacy '+input.sector,profile:input.sector,
  facility:{schemaVersion:'ris-facility/2',id:'facility-1',name:'Legacy facility',unit:'m',
   source:{type:'template',name:'legacy-'+input.sector,geometryStatus:'template',dimensionsConfirmed:false,siteSpecific:false},
   floors:[{id:'floor-1',label:'Floor 1',zMeters:0,widthMeters:input.layout.width,heightMeters:input.layout.height,objects:[...obstacles,...stations]}]},
  process:{schemaVersion:'ris-process/1',id:'process-1',name:'Legacy transport',entityType:'load-unit',
   nodes:[
    {id:'source',label:'Source',kind:'source',facilityObjectId:'pickup',properties:{}},
    {id:'transport',label:'Transport',kind:'transport',properties:{}},
    {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'dropoff',properties:{}},
   ],edges:[{id:'e1',from:'source',to:'transport',mode:'flow'},{id:'e2',from:'transport',to:'sink',mode:'transport'}]},
  robots:[{id:'legacy-robot',label:'Legacy mobile robot',fleetSize:input.robot.count,
   capacity:{payloadKg:input.robot.payloadKg},
   kinematics:{maxSpeedMps:input.robot.speedMps,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:1,widthM:.7,heightM:.5},
   battery:{capacityWh:input.robot.batteryWh,chargeW:input.robot.chargeW,whPerMeter:input.robot.whPerMeter,minSoc:.15},
   handling:{loadSeconds:input.robot.loadSeconds,unloadSeconds:input.robot.unloadSeconds},navigationType:'free-space'}],
  workload:{demandPerHour:input.workload.demandPerHour,unitLoadKg:input.workload.loadKg,
   shiftHours:input.workload.shiftHours,arrivalProcess:input.mode,seed:input.seed},
 });
}
