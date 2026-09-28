import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {runProcessNetwork} from './process-runtime';

function graphScenario(seed=42,reworkProbability=.25){
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'graph',name:'Graph',profile:'factory',
  facility:{schemaVersion:'ris-facility/2',id:'f',name:'Factory',unit:'m',
   source:{type:'manual',name:'factory',geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:20,heightMeters:20,objects:[
    {id:'start',label:'Start',kind:'station',geometry:{x:1,y:1,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'machine',label:'Machine',kind:'machine',geometry:{x:5,y:5,w:2,h:2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'inspection',label:'Inspection',kind:'machine',geometry:{x:10,y:5,w:2,h:2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'good',label:'Good',kind:'station',geometry:{x:15,y:3,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'reject',label:'Reject',kind:'station',geometry:{x:15,y:10,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'p',name:'Inspection with rework',entityType:'part',
   nodes:[
    {id:'source',label:'Source',kind:'source',facilityObjectId:'start',properties:{}},
    {id:'work',label:'Work',kind:'process',facilityObjectId:'machine',durationSeconds:4,properties:{}},
    {id:'check',label:'Check',kind:'inspection',facilityObjectId:'inspection',durationSeconds:2,properties:{}},
    {id:'decision',label:'Quality decision',kind:'decision',properties:{}},
    {id:'good',label:'Good sink',kind:'sink',facilityObjectId:'good',properties:{}},
   ],
   edges:[
    {id:'e1',from:'source',to:'work',mode:'flow'},
    {id:'e2',from:'work',to:'check',mode:'flow'},
    {id:'e3',from:'check',to:'decision',mode:'flow'},
    {id:'pass',from:'decision',to:'good',mode:'flow',probability:1-reworkProbability},
    {id:'rework',from:'decision',to:'work',mode:'flow',probability:reworkProbability},
   ]},
  robots:[{id:'r',label:'R',fleetSize:1,capacity:{payloadKg:10},
   kinematics:{maxSpeedMps:1,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:1,widthM:.7,heightM:.5},
   battery:{capacityWh:1000,chargeW:1000,whPerMeter:.1,minSoc:.1},
   handling:{loadSeconds:0,unloadSeconds:0},navigationType:'free-space'}],
  workload:{demandPerHour:180,unitLoadKg:1,shiftHours:120/3600,arrivalProcess:'fixed',seed},
 });
}

describe('Process Graph runtime',()=>{
 it('executes a decision/rework cycle and eventually reaches a sink',()=>{
  const run=runProcessNetwork(graphScenario(42,.35));
  expect(run.metrics.created).toBeGreaterThan(0);
  expect(run.metrics.completed).toBe(run.metrics.created);
  const workStarts=run.trace.events.filter(event=>event.type==='process.started'&&event.resourceId==='machine');
  expect(workStarts.length).toBeGreaterThan(run.metrics.completed);
  expect(new Set(run.trace.events.map(event=>event.id)).size).toBe(run.trace.events.length);
 });
 it('replays probabilistic routing exactly for the same seed',()=>{
  const a=runProcessNetwork(graphScenario(77,.4));
  const b=runProcessNetwork(graphScenario(77,.4));
  expect(a.metrics).toEqual(b.metrics);
  expect(a.trace.events).toEqual(b.trace.events);
 });
 it('allows multiple sinks when routing is explicit',()=>{
  const input=structuredClone(graphScenario(5,.2));
  input.process.nodes.push({id:'reject',label:'Reject sink',kind:'sink',facilityObjectId:'reject',properties:{}});
  input.process.edges.splice(input.process.edges.findIndex(edge=>edge.id==='rework'),1,
   {id:'reject-route',from:'decision',to:'reject',mode:'flow',probability:.2});
  const run=runProcessNetwork(compileScenario(input));
  expect(run.metrics.completed).toBe(run.metrics.created);
 });
 it('rejects decision probabilities that do not sum to one',()=>{
  const input=structuredClone(graphScenario());
  input.process.edges.find(edge=>edge.id==='pass')!.probability=.5;
  expect(()=>runProcessNetwork(compileScenario(input))).toThrow(/probabilit|sum/i);
 });
 it('fails closed when a cycle cannot reach any sink',()=>{
  const input=structuredClone(graphScenario());
  input.process.edges=input.process.edges.filter(edge=>!['pass','rework'].includes(edge.id));
  input.process.edges.push(
   {id:'loop-a',from:'decision',to:'work',mode:'flow',probability:.5},
   {id:'loop-b',from:'decision',to:'check',mode:'flow',probability:.5},
  );
  expect(()=>runProcessNetwork(compileScenario(input))).toThrow(/sink|cycle|reach/i);
 });
});
