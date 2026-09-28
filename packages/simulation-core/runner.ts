import type {SimulationScenarioV2} from './contracts';
import {generateLinearMotionEvents,planRestToRestMotion} from './motion';
import {planScenarioRoute,type NavigationRoute} from './navigation';
import {parseEventTrace,type EventTrace} from './trace';

export type ReferenceRun={
 engine:{name:'simcore-reference';version:'1'};
 scenarioHash:string;
 route:NavigationRoute;
 trace:EventTrace;
 metrics:{
  created:1;completed:1;backlog:0;
  routeMeters:number;motionSeconds:number;totalSeconds:number;
  energyKwh:number;throughputPerHour:number;
 };
 warnings:string[];
};

const findEndpoint=(scenario:SimulationScenarioV2,kind:'source'|'sink')=>{
 const node=scenario.process.nodes.find(item=>item.kind===kind&&item.facilityObjectId);
 if(!node?.facilityObjectId)throw new Error('Process requires a '+kind+' facility object.');
 for(const floor of scenario.facility.floors){
  if(floor.objects.some(object=>object.id===node.facilityObjectId))
   return {floorId:floor.id,objectId:node.facilityObjectId};
 }
 throw new Error('Process '+kind+' facility object is not present.');
};
export function runReferenceTransport(
 scenario:SimulationScenarioV2,
 options:{robotId:string;safetyClearanceMeters:number;samplePeriodSeconds:number},
):ReferenceRun{
 const robot=scenario.robots.find(item=>item.id===options.robotId);
 if(!robot)throw new Error('Unknown robot: '+options.robotId);
 const source=findEndpoint(scenario,'source'),sink=findEndpoint(scenario,'sink');
 if(source.floorId!==sink.floorId)throw new Error('simcore-reference/1 does not support multi-floor transport.');
 const route=planScenarioRoute({
  scenario,floorId:source.floorId,startObjectId:source.objectId,endObjectId:sink.objectId,
  robotId:robot.id,safetyClearanceMeters:options.safetyClearanceMeters,
 });
 if(!route)throw new Error('No physically clear route exists for the configured robot footprint.');
 const events:Parameters<typeof parseEventTrace>[0] extends never?never:Record<string,unknown>[]=[];
 let t=0;
 events.push({id:'task-created',t,type:'task.created',taskId:'T1'});
 events.push({id:'task-assigned',t,type:'task.assigned',taskId:'T1',resourceId:robot.id});
 events.push({id:'load-started',t,type:'process.started',taskId:'T1',resourceId:source.objectId,data:{phase:'loading'}});
 t+=robot.handling.loadSeconds;
 events.push({id:'load-completed',t,type:'process.completed',taskId:'T1',resourceId:source.objectId,data:{phase:'loading'}});
 let motionSeconds=0;
 for(let segment=0;segment<route.points.length-1;segment++){
  const start=route.points[segment],end=route.points[segment+1];
  const segmentDistance=Math.hypot(end.x-start.x,end.y-start.y);
  const profile=planRestToRestMotion(segmentDistance,{
   maxSpeedMps:robot.kinematics.maxSpeedMps,
   accelerationMps2:robot.kinematics.accelerationMps2,
   decelerationMps2:robot.kinematics.decelerationMps2,
  });
  const generated=generateLinearMotionEvents({
   idPrefix:'segment-'+segment,resourceId:robot.id,floorId:source.floorId,start,end,
   startTimeSeconds:t,samplePeriodSeconds:options.samplePeriodSeconds,
   kinematics:{
    maxSpeedMps:robot.kinematics.maxSpeedMps,
    accelerationMps2:robot.kinematics.accelerationMps2,
    decelerationMps2:robot.kinematics.decelerationMps2,
   },
  });
  events.push(...(segment===0?generated:generated.slice(1)));
  t+=profile.totalSeconds;motionSeconds+=profile.totalSeconds;
 }
 events.push({id:'unload-started',t,type:'process.started',taskId:'T1',resourceId:sink.objectId,data:{phase:'unloading'}});
 t+=robot.handling.unloadSeconds;
 events.push({id:'unload-completed',t,type:'process.completed',taskId:'T1',resourceId:sink.objectId,data:{phase:'unloading'}});
 events.push({id:'task-completed',t,type:'task.completed',taskId:'T1',resourceId:robot.id});
 const engine={name:'simcore-reference' as const,version:'1' as const};
 const trace=parseEventTrace({
  schemaVersion:'ris-event-trace/1',scenarioHash:scenario.scenarioHash,engine,
  startedAt:'1970-01-01T00:00:00.000Z',events,
 },scenario);
 const energyKwh=route.distanceMeters*robot.battery.whPerMeter/1000;
 return {
  engine,scenarioHash:scenario.scenarioHash,route,trace,
  metrics:{
   created:1,completed:1,backlog:0,routeMeters:route.distanceMeters,motionSeconds,totalSeconds:t,
   energyKwh,throughputPerHour:t>0?3600/t:0,
  },
  warnings:[
   'simcore-reference/1 is deterministic and executes one transport job.',
   'The native visibility baseline stops at each route waypoint; continuous cornering is not modeled yet.',
  ],
 };
}
