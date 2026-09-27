import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {compileTransportNetwork} from './transport-network';

function scenario(profile:string){
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'tn-'+profile,name:'Transport '+profile,profile,
  facility:{schemaVersion:'ris-facility/2',id:'f',name:'Facility',unit:'m',
   source:{type:'manual',name:profile,geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:30,heightMeters:20,objects:[
    {id:'a',label:'A',kind:'station',geometry:{x:1,y:1,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'b',label:'B',kind:'machine',geometry:{x:12,y:3,w:2,h:2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'c',label:'C',kind:'station',geometry:{x:25,y:15,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'wall',label:'Wall',kind:'wall',geometry:{x:8,y:0,w:1,h:10,rotationDeg:0},blocking:true,capacity:0,properties:{}},
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'p',name:'P',entityType:'unit',nodes:[
   {id:'source',label:'Source',kind:'source',facilityObjectId:'a',properties:{}},
   {id:'work',label:'Work',kind:'process',facilityObjectId:'b',durationSeconds:5,properties:{}},
   {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'c',properties:{}},
  ],edges:[
   {id:'move-1',from:'source',to:'work',mode:'transport'},
   {id:'move-2',from:'work',to:'sink',mode:'transport'},
  ]},
  robots:[{id:'mobile',label:'Mobile',fleetSize:2,capacity:{payloadKg:100},
   kinematics:{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:1,widthM:.7,heightM:.5},
   battery:{capacityWh:2000,chargeW:1000,whPerMeter:.5,minSoc:.15},
   handling:{loadSeconds:2,unloadSeconds:3},navigationType:'free-space'}],
  workload:{demandPerHour:60,unitLoadKg:20,shiftHours:1,arrivalProcess:'fixed',seed:42},
 });
}

describe('Transport network compiler',()=>{
 it.each(['factory','hospital','airport'])('compiles %s transport edges through the same spatial model',(profile)=>{
  const compiled=compileTransportNetwork(scenario(profile),'mobile',{safetyClearanceMeters:.2});
  expect(compiled.robotId).toBe('mobile');
  expect(compiled.legs).toHaveLength(2);
  expect(compiled.legs.every(leg=>leg.distanceMeters>0&&leg.motionSeconds>0&&leg.energyWh>0)).toBe(true);
  expect(compiled.legs.map(leg=>leg.edgeId)).toEqual(['move-1','move-2']);
  expect(compiled.legs[0].route.points.length).toBeGreaterThan(2);
 });
 it('ignores non-transport process edges',()=>{
  const input=structuredClone(scenario('factory'));
  input.process.edges[1].mode='flow';
  const compiled=compileTransportNetwork(compileScenario(input),'mobile',{safetyClearanceMeters:.2});
  expect(compiled.legs.map(leg=>leg.edgeId)).toEqual(['move-1']);
 });
 it('fails closed when a transport edge endpoint has no physical location',()=>{
  const input=structuredClone(scenario('hospital'));
  delete input.process.nodes[1].facilityObjectId;
  expect(()=>compileTransportNetwork(compileScenario(input),'mobile',{safetyClearanceMeters:.2})).toThrow(/location|facility/i);
 });
 it('fails closed when no footprint-clear route exists',()=>{
  const input=structuredClone(scenario('airport'));
  input.facility.floors[0].objects.push({
   id:'block',label:'Block',kind:'wall',geometry:{x:0,y:10,w:30,h:2,rotationDeg:0},
   blocking:true,capacity:0,properties:{},
  });
  expect(()=>compileTransportNetwork(compileScenario(input),'mobile',{safetyClearanceMeters:.2})).toThrow(/route|reachable/i);
 });
});
