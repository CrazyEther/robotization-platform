import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {runProcessNetwork} from './process-runtime';
import {runProcessExperiment} from './experiment';

function scenario(profile:string,fleetSize=1,demandPerHour=720){
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'integrated-'+profile,name:'Integrated '+profile,profile,
  facility:{schemaVersion:'ris-facility/2',id:'facility',name:'Facility',unit:'m',
   source:{type:'manual',name:profile,geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:30,heightMeters:20,objects:[
    {id:'a',label:'A',kind:'station',geometry:{x:1,y:1,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'b',label:'B',kind:'machine',geometry:{x:15,y:5,w:2,h:2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'c',label:'C',kind:'station',geometry:{x:25,y:15,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'wall',label:'Wall',kind:'wall',geometry:{x:8,y:0,w:1,h:11,rotationDeg:0},blocking:true,capacity:0,properties:{}},
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'process',name:'Flow',entityType:'unit',nodes:[
   {id:'source',label:'Source',kind:'source',facilityObjectId:'a',properties:{}},
   {id:'work',label:'Work',kind:'process',facilityObjectId:'b',durationSeconds:5,properties:{}},
   {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'c',properties:{}},
  ],edges:[
   {id:'move',from:'source',to:'work',mode:'transport'},
   {id:'finish',from:'work',to:'sink',mode:'flow'},
  ]},
  robots:[{id:'mobile',label:'Mobile',fleetSize,capacity:{payloadKg:100},
   kinematics:{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:1,widthM:.7,heightM:.5},
   battery:{capacityWh:5000,chargeW:2000,whPerMeter:.5,minSoc:.1},
   handling:{loadSeconds:2,unloadSeconds:3},navigationType:'free-space'}],
  workload:{demandPerHour,unitLoadKg:20,shiftHours:120/3600,arrivalProcess:'fixed',seed:42},
 });
}

const options={transport:{robotId:'mobile',safetyClearanceMeters:.2,samplePeriodSeconds:1}};

describe('Integrated process and mobile transport',()=>{
 it.each(['factory','hospital','airport'])('executes %s transport with one domain-neutral orchestrator',(profile)=>{
  const run=runProcessNetwork(scenario(profile),options);
  expect(run.metrics.created).toBeGreaterThan(0);
  expect(run.metrics.completed).toBeGreaterThan(0);
  expect(run.metrics.created).toBe(run.metrics.completed+run.metrics.backlog);
  expect(run.metrics.transportDistanceMeters).toBeGreaterThan(0);
  expect(run.metrics.transportEnergyKwh).toBeGreaterThan(0);
  expect(run.metrics.robotUtilization).toBeGreaterThan(0);
  expect(run.trace.events.some(event=>event.type==='robot.motion')).toBe(true);
  const firstWork=run.trace.events.find(event=>event.type==='process.started'&&event.resourceId==='b');
  expect(firstWork?.t).toBeGreaterThan(0);
 });
 it('fails closed when transport edges are present but no mobile transport adapter is configured',()=>{
  expect(()=>runProcessNetwork(scenario('factory'))).toThrow(/transport.*adapter|transport.*options/i);
 });
 it('uses additional robots to reduce transport bottlenecks under load',()=>{
  const one=runProcessNetwork(scenario('factory',1,1200),options);
  const two=runProcessNetwork(scenario('factory',2,1200),options);
  expect(two.metrics.completed).toBeGreaterThan(one.metrics.completed);
  expect(two.metrics.meanTransportWaitSeconds).toBeLessThan(one.metrics.meanTransportWaitSeconds);
 });
 it('keeps task conservation and replay events within the simulation horizon',()=>{
  const input=scenario('hospital',2,900);
  const run=runProcessNetwork(input,options);
  expect(run.metrics.created).toBe(run.metrics.completed+run.metrics.backlog);
  const horizon=input.workload.shiftHours*3600;
  expect(run.trace.events.every(event=>event.t<=horizon+1e-9)).toBe(true);
 });
 it('keeps metrics identical when experiment runs suppress replay traces',()=>{
  const input=scenario('factory',2,900);
  const full=runProcessNetwork(input,options);
  const metricsOnly=runProcessNetwork(input,{...options,traceMode:'metrics'});
  expect(metricsOnly.metrics).toEqual(full.metrics);
  expect(metricsOnly.trace.events).toEqual([]);
  expect(full.trace.events.length).toBeGreaterThan(0);
 });
 it('propagates integrated transport through replicated experiments',()=>{
  const result=runProcessExperiment(scenario('airport',2,900),{replications:4,transport:options.transport});
  expect(result.metrics.transportDistanceMeters.samples).toBe(4);
  expect(result.metrics.transportEnergyKwh.mean).toBeGreaterThan(0);
  expect(result.metrics.robotUtilization.mean).toBeGreaterThan(0);
  expect(result.runs.every(run=>run.metrics.created===run.metrics.completed+run.metrics.backlog)).toBe(true);
 });
});
