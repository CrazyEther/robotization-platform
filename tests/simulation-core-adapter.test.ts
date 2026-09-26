import {describe,expect,it} from 'vitest';
import {createScenario} from '../packages/ris/contracts';
import {compileEditorScenario} from '../packages/ris/simulationCoreAdapter';

describe('RIS → Simulation Core adapter',()=>{
 it('compiles semantic editor objects and site provenance into FacilityModel v2',()=>{
  const scenario=createScenario('hospital');
  const compiled=compileEditorScenario({
   scenario,
   site:{sourceType:'manual',sourceName:'hospital-floor',geometryStatus:'traced',dimensionsConfirmed:true,siteSpecific:true},
   objects:[
    {id:'rack-a',kind:'rack',x:4,y:4,w:2,h:5,blocking:true,label:'Storage',capacity:20},
    {id:'charge-a',kind:'charger',x:2,y:2,w:1,h:1,blocking:false,label:'Charge',capacity:2},
    {id:'lift-a',kind:'elevator',x:20,y:10,w:2,h:2,blocking:false,label:'Lift',capacity:1},
   ],
  });
  expect(compiled.facility.source).toMatchObject({type:'manual',geometryStatus:'traced',siteSpecific:true});
  expect(compiled.facility.floors[0].objects.find(o=>o.id==='rack-a')).toMatchObject({kind:'rack',capacity:20,blocking:true});
  expect(compiled.facility.floors[0].objects.find(o=>o.id==='lift-a')?.kind).toBe('lift');
  expect(compiled.facility.floors[0].objects.filter(o=>o.kind==='station')).toHaveLength(2);
 });
});

import {compileLegacyScenario} from '../packages/ris/legacySimulationCoreAdapter';

describe('Legacy RIS → Simulation Core migration',()=>{
 it('preserves geometry and robot physics for all current domain templates',()=>{
  for(const kind of ['warehouse','factory','hospital','airport'] as const){
   const legacy=createScenario(kind),compiled=compileLegacyScenario(legacy);
   expect(compiled.profile).toBe(kind);
   expect(compiled.facility.floors[0].widthMeters).toBe(legacy.layout.width);
   expect(compiled.facility.floors[0].heightMeters).toBe(legacy.layout.height);
   expect(compiled.facility.floors[0].objects.filter(o=>o.kind==='obstacle')).toHaveLength(legacy.layout.obstacles.length);
   expect(compiled.robots[0].kinematics.maxSpeedMps).toBe(legacy.robot.speedMps);
   expect(compiled.robots[0].capacity.payloadKg).toBe(legacy.robot.payloadKg);
   expect(compiled.workload.unitLoadKg).toBe(legacy.workload.loadKg);
  }
 });
 it('keeps stable golden fingerprints for the four migration templates',()=>{
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
