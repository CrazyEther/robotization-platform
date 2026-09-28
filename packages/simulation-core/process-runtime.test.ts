import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {runProcessNetwork} from './process-runtime';

function scenario(profile:string,nodeKind:'process'|'inspection'|'assembly',durationSeconds:number,capacity:number){
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'process-'+profile,name:'Process '+profile,profile,
  facility:{schemaVersion:'ris-facility/2',id:'facility',name:'Facility',unit:'m',
   source:{type:'manual',name:profile,geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:20,heightMeters:20,objects:[
    {id:'start-station',label:'Start',kind:'station',geometry:{x:1,y:1,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'work-resource',label:'Resource',kind:'machine',geometry:{x:5,y:5,w:2,h:2,rotationDeg:0},blocking:true,capacity,properties:{}},
    {id:'end-station',label:'End',kind:'station',geometry:{x:10,y:10,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'process',name:'Generic flow',entityType:'case',
   nodes:[
    {id:'source',label:'Source',kind:'source',facilityObjectId:'start-station',properties:{}},
    {id:'work',label:'Work',kind:nodeKind,facilityObjectId:'work-resource',durationSeconds,properties:{}},
    {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'end-station',properties:{}},
   ],
   edges:[
    {id:'e1',from:'source',to:'work',mode:'flow'},
    {id:'e2',from:'work',to:'sink',mode:'flow'},
   ]},
  robots:[{id:'generic-mobile-resource',label:'Generic robot',fleetSize:1,capacity:{payloadKg:100},
   kinematics:{maxSpeedMps:1,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:1,widthM:.7,heightM:.5},
   battery:{capacityWh:1000,chargeW:1000,whPerMeter:.1,minSoc:.1},
   handling:{loadSeconds:0,unloadSeconds:0},navigationType:'free-space'}],
  workload:{demandPerHour:360,unitLoadKg:1,shiftHours:60/3600,arrivalProcess:'fixed',seed:42},
 });
}

describe('Domain-neutral process runtime',()=>{
 it.each([
  ['factory','process'] as const,
  ['hospital','inspection'] as const,
  ['airport','assembly'] as const,
 ])('executes %s semantics without sector-specific runtime branches', (profile,kind)=>{
  const run=runProcessNetwork(scenario(profile,kind,5,1));
  expect(run.engine).toEqual({name:'simcore-process',version:'3'});
  expect(run.metrics.created).toBe(6);
  expect(run.metrics.completed).toBe(6);
  expect(run.metrics.backlog).toBe(0);
  expect(run.trace.events.filter(e=>e.type==='process.started')).toHaveLength(6);
  expect(run.trace.events.filter(e=>e.type==='process.completed')).toHaveLength(6);
 });
 it('queues FCFS when a shared resource is saturated',()=>{
  const run=runProcessNetwork(scenario('factory','process',15,1));
  expect(run.metrics.created).toBe(6);
  expect(run.metrics.completed).toBe(4);
  expect(run.metrics.backlog).toBe(2);
  expect(run.metrics.meanQueueSeconds).toBeGreaterThan(0);
  expect(run.metrics.resourceUtilization['work-resource']).toBeCloseTo(1);
 });
 it('uses declared facility capacity as parallel service channels',()=>{
  const one=runProcessNetwork(scenario('factory','process',15,1));
  const two=runProcessNetwork(scenario('factory','process',15,2));
  expect(two.metrics.completed).toBeGreaterThan(one.metrics.completed);
  expect(one.metrics.meanQueueSeconds).not.toBeNull();
  expect(two.metrics.meanQueueSeconds).not.toBeNull();
  expect(two.metrics.meanQueueSeconds!).toBeLessThan(one.metrics.meanQueueSeconds!);
 });

 it('replays stochastic service durations from the scenario seed',()=>{
  const base=scenario('hospital','inspection',5,1);
  const raw=structuredClone(base);
  delete (raw as Partial<typeof raw>).scenarioHash;
  const work=raw.process.nodes.find(n=>n.id==='work')!;
  delete work.durationSeconds;
  work.durationModel={kind:'empirical',valuesSeconds:[1,4,9,16]};
  raw.workload.demandPerHour=120;
  raw.workload.shiftHours=120/3600;
  raw.workload.seed=77;
  const a=runProcessNetwork(compileScenario(raw));
  const b=runProcessNetwork(compileScenario(raw));
  expect(a.trace.events).toEqual(b.trace.events);
  const changed=structuredClone(raw);changed.workload.seed=78;
  const c=runProcessNetwork(compileScenario(changed));
  expect(c.trace.events).not.toEqual(a.trace.events);
 });
 it('rejects ambiguous deterministic and stochastic duration inputs',()=>{
  const base=scenario('factory','process',5,1);
  const raw=structuredClone(base);
  delete (raw as Partial<typeof raw>).scenarioHash;
  raw.process.nodes.find(n=>n.id==='work')!.durationModel={kind:'fixed',seconds:5};
  expect(()=>compileScenario(raw)).toThrow(/durationSeconds|durationModel|both/i);
 });

 it('pauses processing across MTBF/MTTR downtime and exposes availability evidence',()=>{
  const base=scenario('factory','process',30,1);
  const raw=structuredClone(base);
  delete (raw as Partial<typeof raw>).scenarioHash;
  raw.workload.demandPerHour=60;
  raw.workload.shiftHours=60/3600;
  const resource=raw.facility.floors[0].objects.find(o=>o.id==='work-resource')!;
  resource.reliability={model:'fixed',mtbfSeconds:10,mttrSeconds:10};
  const run=runProcessNetwork(compileScenario(raw));
  expect(run.metrics.created).toBe(1);
  expect(run.metrics.completed).toBe(1);
  expect(run.metrics.p95CycleSeconds).toBe(50);
  expect(run.metrics.downtimeSeconds['work-resource']).toBe(30);
  expect(run.metrics.resourceAvailability['work-resource']).toBeCloseTo(.5);
  expect(run.metrics.resourceUtilization['work-resource']).toBeCloseTo(.5);
  expect(run.trace.events.filter(e=>e.type==='resource.failed')).toHaveLength(3);
  expect(run.trace.events.filter(e=>e.type==='resource.repaired')).toHaveLength(3);
 });

 it('fails closed on branching or cyclic process graphs in v1',()=>{
  const base=scenario('factory','process',5,1);
  const branch=structuredClone(base);
  branch.process.nodes.push({id:'other',label:'Other',kind:'sink',facilityObjectId:'end-station',properties:{}});
  branch.process.edges.push({id:'e3',from:'source',to:'other',mode:'flow'});
  expect(()=>runProcessNetwork(compileScenario(branch))).toThrow(/source|branch|outgoing/i);
  const cycle=structuredClone(base);
  cycle.process.edges[1]={id:'e2',from:'work',to:'source',mode:'flow'};
  expect(()=>runProcessNetwork(compileScenario(cycle))).toThrow(/source|cycle|incoming/i);
 });
});
