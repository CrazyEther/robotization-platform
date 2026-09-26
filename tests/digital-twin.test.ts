import {describe,expect,it} from 'vitest';
import {createScenario} from '../packages/ris/contracts';
import {
 anyLogicEvidenceSchema,assessAnyLogicEvidence,buildAnyLogicPackage,evidenceMatchesPackage,fitSceneObjectToLayout,
 processPresets,type AnyLogicEvidence,type AnyLogicFinance,type AnyLogicSceneObject,type AnyLogicSite
} from '../packages/ris/anylogic';

const objects:AnyLogicSceneObject[]=[
 {id:'rack-1',kind:'rack',x:8,y:5,w:2,h:4,blocking:true,label:'Rack',capacity:1},
 {id:'charger-1',kind:'charger',x:2,y:2,w:1,h:1,blocking:false,label:'Charge',capacity:2}
];
const realSite:AnyLogicSite={sourceType:'manual',sourceName:'warehouse-a',geometryStatus:'traced',dimensionsConfirmed:true,siteSpecific:true};
const finance:AnyLogicFinance={robotUnitPrice:1900000,integration:400000,infrastructure:300000,maintenancePerRobotYear:120000,electricityPerKwh:9,baselineAnnualCost:5000000,residualHumanAnnualCost:900000,workdays:250,horizonYears:5,discountRatePercent:12,annualRequiredJobs:1000};

function evidenceFor(sector:'warehouse'|'hospital'|'airport'|'factory'='warehouse'):AnyLogicEvidence{
 const scenario=createScenario(sector);
 const pkg=buildAnyLogicPackage({scenario,robotId:'mir250',objects,baseline:{workers:4,speedMps:1.1,serviceSeconds:80},site:realSite});
 const robots=Array.from({length:scenario.robot.count},(_,i)=>({id:'R'+(i+1),x:1+i,y:1,state:'idle',batteryPercent:100,taskId:null as string|null}));
 return anyLogicEvidenceSchema.parse({
  schemaVersion:'ris-anylogic-evidence/2',inputHash:pkg.inputHash,engine:'AnyLogic',engineVersion:'8.9.10',modelName:'RIS Transport Kernel',modelVersion:'0.1.0',runGroupId:'run-group-1',source:'desktop',input:pkg.input,
  baseline:{runId:'base-1',kpis:{created:120,completed:110,backlog:10,throughputPerHour:13.75,meanQueueMinutes:1.2,p95JobSeconds:180,resourceUtilization:.7,energyKwh:0,loadedMeters:0,emptyMeters:0,trafficWaitSeconds:0}},
  robot:{runId:'robot-1',kpis:{created:120,completed:118,backlog:2,throughputPerHour:14.75,meanQueueMinutes:.5,p95JobSeconds:120,resourceUtilization:.62,energyKwh:5,loadedMeters:1800,emptyMeters:1600,trafficWaitSeconds:45},frames:[
   {t:0,robots,backlog:0,completed:0},
   {t:10,robots:robots.map((r,i)=>({...r,x:r.x+2,state:i===0?'loaded':'idle',batteryPercent:99,taskId:i===0?'T1':null})),backlog:1,completed:0}
  ]},warnings:[]
 });
}

describe('AnyLogic evidence is the only simulation truth accepted by RIS',()=>{
 it('exports a versioned scene/process/robot package for AnyLogic',()=>{
  const scenario=createScenario('hospital');
  const pkg=buildAnyLogicPackage({scenario,robotId:'omron-ld250',objects,baseline:{workers:3,speedMps:1,serviceSeconds:90},site:realSite});
  expect(pkg.schemaVersion).toBe('ris-anylogic-input/2');
  expect(pkg.input.sector).toBe('hospital');
  expect(pkg.input.objects).toEqual(objects);
  expect(pkg.inputHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(pkg.requiredOutputs).toContain('inputHash');
  expect(pkg.requiredOutputs).toContain('robot.frames[]');
  expect(pkg.requiredOutputs).toContain('robot.kpis');
 });
 it('uses distinct workflow presets for warehouse, hospital and airport',()=>{
  expect(processPresets.warehouse.task).toMatch(/пал/i);
  expect(processPresets.hospital.task).toMatch(/мед/i);
  expect(processPresets.airport.task).toMatch(/багаж/i);
  expect(new Set(Object.values(processPresets).map(x=>x.task)).size).toBe(4);
 });
 it('accepts replay frames only when evidence echoes the exact current input',()=>{
  const evidence=evidenceFor('warehouse');
  const pkg=buildAnyLogicPackage({scenario:evidence.input.scenario,robotId:evidence.input.robotId,objects:evidence.input.objects,baseline:evidence.input.baseline,site:evidence.input.site});
  expect(evidenceMatchesPackage(evidence,pkg)).toBe(true);
  const changed=structuredClone(pkg);changed.input.scenario.robot.count++;
  expect(evidenceMatchesPackage(evidence,changed)).toBe(false);
  expect(evidenceMatchesPackage({...evidence,inputHash:'fnv1a64:0000000000000000'},pkg)).toBe(false);
 });
 it('rejects malformed or physically inconsistent AnyLogic evidence',()=>{
  const valid=evidenceFor();
  expect(()=>anyLogicEvidenceSchema.parse({...valid,robot:{...valid.robot,kpis:{...valid.robot.kpis,completed:121}}})).toThrow();
  expect(()=>anyLogicEvidenceSchema.parse({...valid,robot:{...valid.robot,frames:[{t:0,robots:[{id:'R1',x:-1,y:2,state:'moving'}],backlog:0,completed:0}]}})).toThrow();
  const missingRobot=structuredClone(valid);missingRobot.robot.frames[0].robots.pop();
  expect(()=>anyLogicEvidenceSchema.parse(missingRobot)).toThrow(/robot count/i);
 });

 it('keeps editable object geometry inside the calibrated room',()=>{
  const scenario=createScenario('warehouse');
  const rack=objects[0];
  expect(fitSceneObjectToLayout(rack,scenario.layout,{x:54.8,y:33.7,w:4.2,h:3.5})).toMatchObject({x:50.8,y:30.5,w:4.2,h:3.5});
  expect(fitSceneObjectToLayout(rack,scenario.layout,{w:.1,h:.25})).toMatchObject({w:.1,h:.25});
 });
 it('blocks investment conclusions for an illustrative template site',()=>{
  const evidence=evidenceFor();
  const template={...evidence,input:{...evidence.input,site:{sourceType:'template',sourceName:null,geometryStatus:'template',dimensionsConfirmed:false,siteSpecific:false} as AnyLogicSite}};
  const result=assessAnyLogicEvidence(template,finance);
  expect(result.comparable).toBe(false);
  expect(result.roiPercent).toBeNull();
  expect(result.warnings.join(' ')).toMatch(/геометр/i);
 });
 it('computes ROI only from matched AnyLogic baseline and robot outputs',()=>{
  const evidence=evidenceFor();
  const result=assessAnyLogicEvidence(evidence,finance);
  expect(result.comparable).toBe(true);
  expect(result.capex).toBeGreaterThan(0);
  expect(result.roiPercent).not.toBeNull();
  const blocked=assessAnyLogicEvidence(evidence,{...finance,annualRequiredJobs:99999999});
  expect(blocked.roiPercent).toBeNull();
 });
});
