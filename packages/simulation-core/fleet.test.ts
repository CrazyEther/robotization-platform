import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {runTransportFleet} from './fleet';

function fixture({fleetSize=2,demandPerHour=360,shiftHours=70/3600,arrivalProcess='fixed',seed=42,loadSeconds=10,unloadSeconds=20}:{fleetSize?:number;demandPerHour?:number;shiftHours?:number;arrivalProcess?:'fixed'|'poisson';seed?:number;loadSeconds?:number;unloadSeconds?:number}={}){
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'fleet',name:'Fleet fixture',
  facility:{schemaVersion:'ris-facility/2',id:'f',name:'F',unit:'m',
   source:{type:'manual',name:'fixture',geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:20,heightMeters:12,objects:[
    {id:'a',label:'A',kind:'station',geometry:{x:.9,y:.9,w:.2,h:.2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'b',label:'B',kind:'station',geometry:{x:3.9,y:4.9,w:.2,h:.2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'p',name:'Transport',entityType:'unit',
   nodes:[
    {id:'source',label:'Source',kind:'source',facilityObjectId:'a',properties:{}},
    {id:'transport',label:'Transport',kind:'transport',properties:{}},
    {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'b',properties:{}},
   ],edges:[{id:'e1',from:'source',to:'transport',mode:'flow'},{id:'e2',from:'transport',to:'sink',mode:'transport'}]},
  robots:[{id:'robot-1',label:'Robot',fleetSize,capacity:{payloadKg:100},
   kinematics:{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:.2,widthM:.2,heightM:.2},
   battery:{capacityWh:2000,chargeW:1000,whPerMeter:.2,minSoc:.15},
   handling:{loadSeconds,unloadSeconds},navigationType:'free-space'}],
  workload:{demandPerHour,unitLoadKg:50,shiftHours,arrivalProcess,seed},
 });
}

describe('Transport fleet DES',()=>{
 it('matches an independent two-server FCFS oracle',()=>{
  const run=runTransportFleet(fixture(),{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:.5});
  expect(run.engine).toEqual({name:'simcore-fleet',version:'1'});
  expect(run.metrics).toMatchObject({created:7,assigned:4,completed:2,backlog:5});
  expect(run.metrics.meanQueueSeconds).toBeCloseTo(9.5,12);
  expect(run.metrics.robotUtilization).toBeCloseTo(130/140,12);
  const assigned=run.trace.events.filter(e=>e.type==='task.assigned');
  expect(assigned.map(e=>e.t)).toEqual([0,10,39,49]);
  expect(assigned.map(e=>e.resourceId)).toEqual(['robot-1#1','robot-1#2','robot-1#1','robot-1#2']);
 });
 it('conserves tasks at the simulation horizon',()=>{
  const run=runTransportFleet(fixture({fleetSize:1,shiftHours:100/3600}),{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:1});
  expect(run.metrics.created).toBe(10);
  expect(run.metrics.completed).toBe(2);
  expect(run.metrics.backlog).toBe(8);
  expect(run.metrics.created).toBe(run.metrics.completed+run.metrics.backlog);
  expect(run.metrics.meanQueueSeconds).toBeCloseTo(29,12);
 });
 it('emits distinct validated fleet resource identities',()=>{
  const run=runTransportFleet(fixture(),{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:1});
  const resources=new Set(run.trace.events.filter(e=>e.type==='robot.motion').map(e=>e.resourceId));
  expect(resources).toEqual(new Set(['robot-1#1','robot-1#2']));
 });
 it('serializes shared-corridor motion and records traffic waiting',()=>{
  const run=runTransportFleet(fixture({fleetSize:2,demandPerHour:7200,shiftHours:10/3600,loadSeconds:0,unloadSeconds:0}),{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:.5});
  expect(run.metrics.trafficWaitSeconds).toBeCloseTo(9.5,12);
  expect(run.trace.events.filter(e=>e.type==='traffic.conflict').length).toBeGreaterThan(0);
  expect(run.warnings.join(' ')).toMatch(/exclusive-corridor/i);
 });
 it('replays Poisson arrivals reproducibly from the scenario seed',()=>{
  const scenario=fixture({fleetSize:2,demandPerHour:10,shiftHours:1,arrivalProcess:'poisson',seed:123});
  const a=runTransportFleet(scenario,{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:2});
  const b=runTransportFleet(scenario,{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:2});
  expect(a).toEqual(b);
  const changed=fixture({fleetSize:2,demandPerHour:10,shiftHours:1,arrivalProcess:'poisson',seed:124});
  const c=runTransportFleet(changed,{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:2});
  expect(c.trace.events.filter(e=>e.type==='task.created').map(e=>e.t))
   .not.toEqual(a.trace.events.filter(e=>e.type==='task.created').map(e=>e.t));
 });
});
