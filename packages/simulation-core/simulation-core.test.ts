import {describe,expect,it} from 'vitest';
import {createScenario} from '../ris/contracts';
import {
 compileLegacyScenario,compileScenario,parseEventTrace,
 type SimulationScenarioV2
} from './index';

describe('Simulation Core v2 contracts',()=>{
 it('compiles every legacy domain into one domain-neutral scenario shape',()=>{
  const compiled=['warehouse','factory','hospital','airport'].map(kind=>
   compileLegacyScenario(createScenario(kind as Parameters<typeof createScenario>[0])));
  expect(new Set(compiled.map(x=>x.schemaVersion))).toEqual(new Set(['ris-simulation-scenario/2']));
  expect(compiled.every(x=>x.facility.floors[0].objects.some(o=>o.kind==='station'))).toBe(true);
  expect(compiled.every(x=>x.process.nodes.map(n=>n.kind).join(',')==='source,transport,sink')).toBe(true);
 });
 it('preserves legacy geometry and robot physics during migration',()=>{
  const legacy=createScenario('hospital');
  const compiled=compileLegacyScenario(legacy);
  expect(compiled.facility.floors[0].widthMeters).toBe(legacy.layout.width);
  expect(compiled.facility.floors[0].heightMeters).toBe(legacy.layout.height);
  expect(compiled.facility.floors[0].objects.filter(o=>o.kind==='obstacle')).toHaveLength(legacy.layout.obstacles.length);
  expect(compiled.robots[0].kinematics.maxSpeedMps).toBe(legacy.robot.speedMps);
  expect(compiled.robots[0].capacity.payloadKg).toBe(legacy.robot.payloadKg);
  expect(compiled.workload.unitLoadKg).toBe(legacy.workload.loadKg);
 });

 it('fails closed when process references unknown facility objects',()=>{
  const base=compileLegacyScenario(createScenario('warehouse'));
  const broken=structuredClone(base) as SimulationScenarioV2;
  broken.process.nodes[1].facilityObjectId='missing-station';
  expect(()=>compileScenario(broken)).toThrow(/facility object/i);
 });
 it('fails closed when robot capability cannot carry the configured unit load',()=>{
  const base=compileLegacyScenario(createScenario('factory'));
  const broken=structuredClone(base) as SimulationScenarioV2;
  broken.robots[0].capacity.payloadKg=1;
  broken.workload.unitLoadKg=100;
  expect(()=>compileScenario(broken)).toThrow(/payload/i);
 });

 it('rejects duplicate facility identifiers and geometry outside floor bounds',()=>{
  const base=compileLegacyScenario(createScenario('airport'));
  const duplicate=structuredClone(base) as SimulationScenarioV2;
  duplicate.facility.floors[0].objects.push(structuredClone(duplicate.facility.floors[0].objects[0]));
  expect(()=>compileScenario(duplicate)).toThrow(/unique/i);
  const outside=structuredClone(base) as SimulationScenarioV2;
  outside.facility.floors[0].objects[0].geometry.x=outside.facility.floors[0].widthMeters+1;
  expect(()=>compileScenario(outside)).toThrow(/bounds/i);
 });
 it('uses one versioned event trace as the replay truth',()=>{
  const scenario=compileLegacyScenario(createScenario('warehouse'));
  const trace=parseEventTrace({
   schemaVersion:'ris-event-trace/1',scenarioHash:scenario.scenarioHash,
   engine:{name:'simcore-v2-test',version:'0.1.0'},startedAt:'2026-09-27T00:00:00Z',
   events:[
    {id:'e1',t:0,type:'task.created',taskId:'T1'},
    {id:'e2',t:1,type:'robot.motion',resourceId:scenario.robots[0].id,taskId:'T1',position:{floorId:'floor-1',x:1,y:1}},
    {id:'e3',t:2,type:'task.completed',taskId:'T1'}
   ]
  },scenario);
  expect(trace.events.map(e=>e.type)).toEqual(['task.created','robot.motion','task.completed']);
  expect(trace.scenarioHash).toBe(scenario.scenarioHash);
 });

 it('rejects traces with time reversal or unknown robot references',()=>{
  const scenario=compileLegacyScenario(createScenario('warehouse'));
  const common={schemaVersion:'ris-event-trace/1' as const,scenarioHash:scenario.scenarioHash,engine:{name:'test',version:'1'},startedAt:'2026-09-27T00:00:00Z'};
  expect(()=>parseEventTrace({...common,events:[
   {id:'a',t:2,type:'task.created',taskId:'T1'},
   {id:'b',t:1,type:'task.completed',taskId:'T1'}
  ]},scenario)).toThrow(/time/i);
  expect(()=>parseEventTrace({...common,events:[
   {id:'a',t:0,type:'robot.motion',resourceId:'unknown',position:{floorId:'floor-1',x:1,y:1}}
  ]},scenario)).toThrow(/resource/i);
 });
});

describe('Golden legacy migration scenarios',()=>{
 it('keeps stable fingerprints for the four supported domain templates',()=>{
  const hashes=Object.fromEntries((['warehouse','factory','hospital','airport'] as const).map(kind=>[
   kind,compileLegacyScenario(createScenario(kind)).scenarioHash
  ]));
  expect(hashes).toEqual({
   warehouse:'fnv1a64:1508cd2aaf47b2d6',
   factory:'fnv1a64:c35958d071209681',
   hospital:'fnv1a64:1fb2b9a7e91b1dab',
   airport:'fnv1a64:41bdf643b076108e',
  });
 });
});
