import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {runReferenceTransport} from './runner';

function scenario(withBarrier=false){
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'run',name:'Runner fixture',
  facility:{schemaVersion:'ris-facility/2',id:'f',name:'F',unit:'m',
   source:{type:'manual',name:'fixture',geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:20,heightMeters:12,objects:[
    {id:'a',label:'A',kind:'station',geometry:{x:.9,y:.9,w:.2,h:.2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'b',label:'B',kind:'station',geometry:{x:3.9,y:4.9,w:.2,h:.2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    ...(withBarrier?[{id:'barrier',label:'Barrier',kind:'obstacle' as const,geometry:{x:2,y:0,w:2,h:12,rotationDeg:0},blocking:true,capacity:0,properties:{}}]:[]),
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'p',name:'Transport',entityType:'unit',
   nodes:[
    {id:'source',label:'Source',kind:'source',facilityObjectId:'a',properties:{}},
    {id:'transport',label:'Transport',kind:'transport',properties:{}},
    {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'b',properties:{}},
   ],edges:[{id:'e1',from:'source',to:'transport',mode:'flow'},{id:'e2',from:'transport',to:'sink',mode:'transport'}]},
  robots:[{id:'robot-1',label:'Robot',fleetSize:1,capacity:{payloadKg:100},
   kinematics:{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:.2,widthM:.2,heightM:.2},
   battery:{capacityWh:2000,chargeW:1000,whPerMeter:.2,minSoc:.15},
   handling:{loadSeconds:10,unloadSeconds:20},navigationType:'free-space'}],
  workload:{demandPerHour:1,unitLoadKg:50,shiftHours:8,arrivalProcess:'fixed',seed:42},
 });
}

describe('Simulation Core deterministic reference runner',()=>{
 it('executes facility → route → motion → trace → KPI deterministically',()=>{
  const run=runReferenceTransport(scenario(),{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:.25});
  expect(run.engine).toEqual({name:'simcore-reference',version:'1'});
  expect(run.metrics.routeMeters).toBeCloseTo(5,12);
  expect(run.metrics.motionSeconds).toBeCloseTo(4.5,12);
  expect(run.metrics.totalSeconds).toBeCloseTo(34.5,12);
  expect(run.metrics.energyKwh).toBeCloseTo(.001,12);
  expect(run.metrics.created).toBe(1);
  expect(run.metrics.completed).toBe(1);
  expect(run.metrics.backlog).toBe(0);
  expect(run.trace.events[0]).toMatchObject({type:'task.created',t:0,taskId:'T1'});
  expect(run.trace.events.at(-1)).toMatchObject({type:'task.completed',t:34.5,taskId:'T1'});
  expect(run.trace.events.filter(e=>e.type==='robot.motion').length).toBeGreaterThan(2);
 });
 it('is reproducible byte-for-byte for equal inputs',()=>{
  const input=scenario();
  expect(runReferenceTransport(input,{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:.5}))
   .toEqual(runReferenceTransport(input,{robotId:'robot-1',safetyClearanceMeters:0,samplePeriodSeconds:.5}));
 });
 it('fails closed when no physically clear route exists',()=>{
  expect(()=>runReferenceTransport(scenario(true),{robotId:'robot-1',safetyClearanceMeters:.1,samplePeriodSeconds:.5}))
   .toThrow(/route/i);
 });
});
