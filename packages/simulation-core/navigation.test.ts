import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {conservativeFootprintRadius,planScenarioRoute,planVisibilityRoute} from './navigation';

describe('Continuous visibility navigation baseline',()=>{
 it('uses the exact Euclidean path when line of sight is clear',()=>{
  const route=planVisibilityRoute({
   bounds:{width:20,height:20},start:{x:1,y:1},end:{x:4,y:5},obstacles:[],clearanceRadius:0,
  });
  expect(route).not.toBeNull();
  expect(route!.distanceMeters).toBeCloseTo(5,12);
  expect(route!.points).toEqual([{x:1,y:1},{x:4,y:5}]);
 });
 it('routes continuously around an inflated obstacle instead of a 1m grid',()=>{
  const route=planVisibilityRoute({
   bounds:{width:12,height:10},start:{x:1,y:5},end:{x:11,y:5},
   obstacles:[{id:'block',x:4,y:2,w:2,h:6}],clearanceRadius:.5,
  });
  expect(route).not.toBeNull();
  expect(route!.distanceMeters).toBeCloseTo(13.002039759017002,12);
  expect(route!.points.some(p=>p.x===3.5||p.x===6.5)).toBe(true);
  expect(route!.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
 });
 it('returns no path when an inflated obstacle separates the navigable area',()=>{
  expect(planVisibilityRoute({
   bounds:{width:10,height:10},start:{x:1,y:5},end:{x:9,y:5},
   obstacles:[{id:'barrier',x:4,y:0,w:2,h:10}],clearanceRadius:.4,
  })).toBeNull();
 });
 it('rejects endpoints that violate wall or obstacle clearance',()=>{
  expect(planVisibilityRoute({
   bounds:{width:10,height:10},start:{x:.2,y:5},end:{x:9,y:5},obstacles:[],clearanceRadius:.5,
  })).toBeNull();
  expect(planVisibilityRoute({
   bounds:{width:10,height:10},start:{x:4,y:4},end:{x:9,y:5},
   obstacles:[{id:'box',x:3,y:3,w:2,h:2}],clearanceRadius:.2,
  })).toBeNull();
 });

 it('plans from semantic facility objects using the robot footprint',()=>{
  const scenario=compileScenario({
   schemaVersion:'ris-simulation-scenario/2',id:'nav',name:'Navigation fixture',
   facility:{schemaVersion:'ris-facility/2',id:'f',name:'F',unit:'m',
    source:{type:'manual',name:'fixture',geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
    floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:12,heightMeters:10,objects:[
     {id:'a',label:'A',kind:'station',geometry:{x:.9,y:4.9,w:.2,h:.2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
     {id:'b',label:'B',kind:'station',geometry:{x:10.9,y:4.9,w:.2,h:.2,rotationDeg:0},blocking:false,capacity:1,properties:{}},
     {id:'block',label:'Block',kind:'obstacle',geometry:{x:4,y:2,w:2,h:6,rotationDeg:0},blocking:true,capacity:0,properties:{}},
    ]}]},
   process:{schemaVersion:'ris-process/1',id:'p',name:'P',entityType:'unit',
    nodes:[{id:'s',label:'S',kind:'source',facilityObjectId:'a',properties:{}},{id:'k',label:'K',kind:'sink',facilityObjectId:'b',properties:{}}],
    edges:[{id:'e',from:'s',to:'k',mode:'transport'}]},
   robots:[{id:'r',label:'R',fleetSize:1,capacity:{payloadKg:10},
    kinematics:{maxSpeedMps:1,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
    dimensions:{lengthM:1,widthM:.6,heightM:.5},
    battery:{capacityWh:1000,chargeW:500,whPerMeter:.2,minSoc:.15},
    handling:{loadSeconds:0,unloadSeconds:0},navigationType:'free-space'}],
   workload:{demandPerHour:1,unitLoadKg:1,shiftHours:1,arrivalProcess:'fixed',seed:1},
  });
  const route=planScenarioRoute({scenario,floorId:'floor-1',startObjectId:'a',endObjectId:'b',robotId:'r',safetyClearanceMeters:.2});
  expect(route).not.toBeNull();
  expect(route!.distanceMeters).toBeGreaterThan(10);
  const rotated=structuredClone(scenario);
  rotated.facility.floors[0].objects.find(o=>o.id==='block')!.geometry.rotationDeg=15;
  expect(()=>planScenarioRoute({scenario:rotated,floorId:'floor-1',startObjectId:'a',endObjectId:'b',robotId:'r',safetyClearanceMeters:.2}))
   .toThrow(/axis-aligned/i);
 });

 it('computes a rotation-invariant conservative radius from robot footprint',()=>{
  expect(conservativeFootprintRadius({lengthM:1,widthM:.6},.2))
   .toBeCloseTo(Math.hypot(1,.6)/2+.2,12);
 });
});
