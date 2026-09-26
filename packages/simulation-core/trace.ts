import {z} from 'zod';
import type {SimulationScenarioV2} from './contracts';

const finite=z.number().finite();
const id=z.string().trim().min(1).max(160);
const eventType=z.enum([
 'task.created','task.assigned','task.completed',
 'robot.motion','robot.waiting','robot.charging','robot.failed',
 'resource.requested','resource.reserved','resource.released',
 'process.started','process.completed','traffic.conflict','traffic.deadlock',
]);
const position=z.object({floorId:id,x:finite,y:finite,z:finite.optional()}).strict();
export const eventTraceSchema=z.object({
 schemaVersion:z.literal('ris-event-trace/1'),scenarioHash:z.string().regex(/^fnv1a64:[0-9a-f]{16}$/),
 engine:z.object({name:z.string().min(1).max(120),version:z.string().min(1).max(80)}).strict(),
 startedAt:z.string().datetime({offset:true}),
 events:z.array(z.object({
  id,t:finite.min(0),type:eventType,resourceId:id.optional(),taskId:id.optional(),
  entityId:id.optional(),position:position.optional(),
  data:z.record(z.string(),z.union([z.string(),finite,z.boolean(),z.null()])).optional(),
 }).strict()).max(1000000),
}).strict();
export type EventTrace=z.infer<typeof eventTraceSchema>;
export function parseEventTrace(raw:unknown,scenario:SimulationScenarioV2):EventTrace{
 const trace=eventTraceSchema.parse(raw);
 if(trace.scenarioHash!==scenario.scenarioHash)throw new Error('Event trace scenarioHash does not match scenario.');
 const resources=new Set<string>(scenario.robots.map(robot=>robot.id));
 for(const floor of scenario.facility.floors)for(const object of floor.objects)resources.add(object.id);
 const floors=new Map(scenario.facility.floors.map(floor=>[floor.id,floor] as const));
 const eventIds=new Set<string>();let previous=-1;
 for(const event of trace.events){
  if(eventIds.has(event.id))throw new Error('Event ids must be unique: '+event.id);eventIds.add(event.id);
  if(event.t<previous)throw new Error('Event trace time must be monotonic.');previous=event.t;
  if(event.resourceId&&!resources.has(event.resourceId))throw new Error('Event references unknown resource: '+event.resourceId);
  if(event.position){
   const floor=floors.get(event.position.floorId);
   if(!floor)throw new Error('Event position references unknown floor: '+event.position.floorId);
   if(event.position.x<0||event.position.y<0||event.position.x>floor.widthMeters||event.position.y>floor.heightMeters)
    throw new Error('Event position is outside facility bounds.');
  }
 }
 return trace;
}
