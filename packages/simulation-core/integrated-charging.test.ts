import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {runProcessNetwork} from './process-runtime';

function chargingScenario({chargerCapacity=1,fleetSize=1,demandPerHour=1200,batteryWh=50}:{chargerCapacity?:number;fleetSize?:number;demandPerHour?:number;batteryWh?:number}={}){
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'charging-process',name:'Charging process',profile:'hospital',
  facility:{schemaVersion:'ris-facility/2',id:'f',name:'Facility',unit:'m',
   source:{type:'manual',name:'charging',geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:30,heightMeters:20,objects:[
    {id:'a',label:'A',kind:'station',geometry:{x:1,y:1,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'b',label:'B',kind:'station',geometry:{x:18,y:8,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'charger',label:'Charger',kind:'charger',geometry:{x:2.5,y:1,w:1,h:1,rotationDeg:0},blocking:false,capacity:chargerCapacity,properties:{}},
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'p',name:'P',entityType:'sample',nodes:[
   {id:'source',label:'Source',kind:'source',facilityObjectId:'a',properties:{}},
   {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'b',properties:{}},
  ],edges:[{id:'move',from:'source',to:'sink',mode:'transport'}]},
  robots:[{id:'mobile',label:'Medical mobile robot',fleetSize,capacity:{payloadKg:100},
   kinematics:{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:.8,widthM:.6,heightM:1},
   battery:{capacityWh:batteryWh,chargeW:3600,whPerMeter:1,minSoc:.2},
   handling:{loadSeconds:0,unloadSeconds:0},navigationType:'free-space'}],
  workload:{demandPerHour,unitLoadKg:5,shiftHours:180/3600,arrivalProcess:'fixed',seed:42},
 });
}
const options={transport:{robotId:'mobile',safetyClearanceMeters:0,samplePeriodSeconds:1}};

describe('Integrated transport charging',()=>{
 it('routes a low-SOC robot to a charger and resumes queued process work',()=>{
  const run=runProcessNetwork(chargingScenario(),options);
  expect(run.metrics.completed).toBeGreaterThan(1);
  expect(run.metrics.chargeCount).toBeGreaterThan(0);
  expect(run.metrics.chargingSeconds).toBeGreaterThan(0);
  expect(run.metrics.chargedEnergyKwh).toBeGreaterThan(0);
  expect(run.metrics.minRobotSoc).toBeGreaterThanOrEqual(.2-1e-12);
  expect(run.trace.events.some(event=>event.type==='robot.charging')).toBe(true);
 });
 it('models charger channel contention through declared capacity',()=>{
  const one=runProcessNetwork(chargingScenario({chargerCapacity:1,fleetSize:2,demandPerHour:2400,batteryWh:50}),options);
  const two=runProcessNetwork(chargingScenario({chargerCapacity:2,fleetSize:2,demandPerHour:2400,batteryWh:50}),options);
  expect(one.metrics.chargerWaitSeconds).toBeGreaterThan(0);
  expect(two.metrics.chargerWaitSeconds).toBeLessThan(one.metrics.chargerWaitSeconds);
 });
 it('fails closed when battery cannot safely reach any charger',()=>{
  expect(()=>runProcessNetwork(chargingScenario({batteryWh:12,demandPerHour:600}),options)).toThrow(/battery|charger|soc|energy/i);
 });
 it('rejects a battery that is insufficient for charge-to-pickup-to-delivery-to-safe-escape duty',()=>{
  expect(()=>runProcessNetwork(chargingScenario({batteryWh:45,demandPerHour:1200}),options)).toThrow(/battery|charger|soc|energy/i);
 });
 it('includes charger travel in robot movement evidence',()=>{
  const run=runProcessNetwork(chargingScenario(),options);
  const chargeStart=run.trace.events.find(event=>event.type==='robot.charging'&&event.data?.phase==='started');
  expect(chargeStart).toBeTruthy();
  const before=run.trace.events.filter(event=>event.type==='robot.motion'&&event.t<=(chargeStart?.t??0));
  expect(before.length).toBeGreaterThan(0);
 });
});
