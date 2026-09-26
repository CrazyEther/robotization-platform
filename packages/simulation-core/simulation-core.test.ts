import {describe,expect,it} from 'vitest';
import {compileScenario,parseEventTrace,type SimulationScenarioV2} from './index';

function neutralScenario():SimulationScenarioV2{
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',
  id:'neutral-scenario',name:'Neutral scenario',
  facility:{schemaVersion:'ris-facility/2',id:'facility-1',name:'Facility',unit:'m',
   source:{type:'manual',name:'fixture',geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor 1',zMeters:0,widthMeters:20,heightMeters:12,objects:[
    {id:'source-station',label:'Source',kind:'station',geometry:{x:1,y:1,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'sink-station',label:'Sink',kind:'station',geometry:{x:18,y:10,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'obstacle-1',label:'Obstacle',kind:'obstacle',geometry:{x:8,y:2,w:2,h:5,rotationDeg:0},blocking:true,capacity:0,properties:{}},
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'process-1',name:'Transport',entityType:'unit',
   nodes:[
    {id:'source',label:'Source',kind:'source',facilityObjectId:'source-station',properties:{}},
    {id:'transport',label:'Transport',kind:'transport',properties:{}},
    {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'sink-station',properties:{}},
   ],
   edges:[{id:'e1',from:'source',to:'transport',mode:'flow'},{id:'e2',from:'transport',to:'sink',mode:'transport'}]},
  robots:[{id:'robot-1',label:'Robot',fleetSize:2,capacity:{payloadKg:100},
   kinematics:{maxSpeedMps:1,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:1,widthM:.7,heightM:.5},
   battery:{capacityWh:2000,chargeW:1000,whPerMeter:.2,minSoc:.15},
   handling:{loadSeconds:20,unloadSeconds:20},navigationType:'free-space'}],
  workload:{demandPerHour:10,unitLoadKg:50,shiftHours:8,arrivalProcess:'fixed',seed:42},
 });
}

describe('Simulation Core v2 contracts',()=>{
 it('compiles a domain-neutral scenario with a stable versioned hash',()=>{
  const compiled=neutralScenario();
  expect(compiled.schemaVersion).toBe('ris-simulation-scenario/2');
  expect(compiled.scenarioHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(compileScenario(compiled).scenarioHash).toBe(compiled.scenarioHash);
 });
 it('fails closed when process references unknown facility objects',()=>{
  const broken=structuredClone(neutralScenario());
  broken.process.nodes[1].facilityObjectId='missing-station';
  expect(()=>compileScenario(broken)).toThrow(/facility object/i);
 });
 it('fails closed when robot capability cannot carry the configured unit load',()=>{
  const broken=structuredClone(neutralScenario());
  broken.robots[0].capacity.payloadKg=1;
  broken.workload.unitLoadKg=100;
  expect(()=>compileScenario(broken)).toThrow(/payload/i);
 });
 it('rejects duplicate facility identifiers and geometry outside floor bounds',()=>{
  const duplicate=structuredClone(neutralScenario());
  duplicate.facility.floors[0].objects.push(structuredClone(duplicate.facility.floors[0].objects[0]));
  expect(()=>compileScenario(duplicate)).toThrow(/unique/i);
  const outside=structuredClone(neutralScenario());
  outside.facility.floors[0].objects[0].geometry.x=outside.facility.floors[0].widthMeters+1;
  expect(()=>compileScenario(outside)).toThrow(/bounds/i);
 });
 it('uses one versioned event trace as the replay truth',()=>{
  const scenario=neutralScenario();
  const trace=parseEventTrace({
   schemaVersion:'ris-event-trace/1',scenarioHash:scenario.scenarioHash,
   engine:{name:'simcore-v2-test',version:'0.1.0'},startedAt:'2026-09-27T00:00:00Z',
   events:[
    {id:'e1',t:0,type:'task.created',taskId:'T1'},
    {id:'e2',t:1,type:'robot.motion',resourceId:'robot-1',taskId:'T1',position:{floorId:'floor-1',x:1,y:1}},
    {id:'e3',t:2,type:'task.completed',taskId:'T1'}
   ]
  },scenario);
  expect(trace.events.map(e=>e.type)).toEqual(['task.created','robot.motion','task.completed']);
 });
 it('rejects traces with time reversal or unknown robot references',()=>{
  const scenario=neutralScenario();
  const common={schemaVersion:'ris-event-trace/1' as const,scenarioHash:scenario.scenarioHash,engine:{name:'test',version:'1'},startedAt:'2026-09-27T00:00:00Z'};
  expect(()=>parseEventTrace({...common,events:[
   {id:'a',t:2,type:'task.created',taskId:'T1'},{id:'b',t:1,type:'task.completed',taskId:'T1'}
  ]},scenario)).toThrow(/time/i);
  expect(()=>parseEventTrace({...common,events:[
   {id:'a',t:0,type:'robot.motion',resourceId:'unknown',position:{floorId:'floor-1',x:1,y:1}}
  ]},scenario)).toThrow(/resource/i);
 });
});
