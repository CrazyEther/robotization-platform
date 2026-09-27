import {z} from 'zod';
import {simulationScenarioSchema,type SimulationScenarioV2} from './contracts';

function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value as Record<string,unknown>)
  .filter(([k])=>k!=='scenarioHash').sort(([a],[b])=>a.localeCompare(b))
  .map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
function fingerprint(value:unknown):string{
 const bytes=new TextEncoder().encode(canonical(value));let hash=0xcbf29ce484222325n;
 for(const byte of bytes){hash^=BigInt(byte);hash=BigInt.asUintN(64,hash*0x100000001b3n);}
 return 'fnv1a64:'+hash.toString(16).padStart(16,'0');
}
function validateReferences(value:z.infer<typeof simulationScenarioSchema>):void{
 const objectIds=new Set<string>(),nodeIds=new Set<string>(),floorIds=new Set<string>(),edgeIds=new Set<string>(),resourceIds=new Set<string>();
 for(const floor of value.facility.floors){
  if(floorIds.has(floor.id))throw new Error('Floor ids must be unique: '+floor.id);floorIds.add(floor.id);
  for(const object of floor.objects){
   if(objectIds.has(object.id))throw new Error('Facility object ids must be unique: '+object.id);
   objectIds.add(object.id);
   if(resourceIds.has(object.id))throw new Error('Resource ids must be unique: '+object.id);resourceIds.add(object.id);
   const {x,y,w,h}=object.geometry;
   if(x+w>floor.widthMeters||y+h>floor.heightMeters)
    throw new Error('Facility object geometry exceeds floor bounds: '+object.id);
  }
 }
 for(const node of value.process.nodes){
  if(nodeIds.has(node.id))throw new Error('Process node ids must be unique: '+node.id);
  nodeIds.add(node.id);
  if(node.facilityObjectId&&!objectIds.has(node.facilityObjectId))
   throw new Error('Process references unknown facility object: '+node.facilityObjectId);
 }
 for(const edge of value.process.edges){
  if(edgeIds.has(edge.id))throw new Error('Process edge ids must be unique: '+edge.id);edgeIds.add(edge.id);
  if(!nodeIds.has(edge.from)||!nodeIds.has(edge.to))
   throw new Error('Process edge references unknown node: '+edge.id);
 }
 for(const robot of value.robots){
  const ids=[robot.id,...Array.from({length:robot.fleetSize},(_,index)=>robot.id+'#'+(index+1))];
  for(const resourceId of ids){
   if(resourceIds.has(resourceId))throw new Error('Resource ids must be unique: '+resourceId);
   resourceIds.add(resourceId);
  }
 }
 const maxPayload=Math.max(...value.robots.map(robot=>robot.capacity.payloadKg));
 if(maxPayload<value.workload.unitLoadKg)
  throw new Error('Robot payload is below configured unit load.');
}
export function compileScenario(raw:unknown):SimulationScenarioV2{
 const parsed=simulationScenarioSchema.parse(raw);
 validateReferences(parsed);
 const withoutHash={...parsed,scenarioHash:undefined};
 return {...parsed,scenarioHash:fingerprint(withoutHash)} as SimulationScenarioV2;
}
