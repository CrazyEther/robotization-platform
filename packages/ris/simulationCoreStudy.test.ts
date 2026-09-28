import {describe,expect,it} from 'vitest';
import {createScenario} from './contracts';
import {compileLegacyScenario} from './legacySimulationCoreAdapter';
import {runSimulationCoreStudy,simulationStudyRequestSchema} from './simulationCoreStudy';
import {assessSimulationCoreStudyDto,simulationCoreStudyDtoSchema,toSimulationCoreStudyDto} from './simulationCoreStudyClient';

const baseline={workers:4,speedMps:1.1,serviceSeconds:80};

describe('Simulation Core study',()=>{
 it('runs robot and baseline variants from one canonical scenario',()=>{
  const scenario=compileLegacyScenario(createScenario('hospital'));
  const study=runSimulationCoreStudy({scenario,robotId:'legacy-robot',baseline,replications:5,safetyClearanceMeters:.2,samplePeriodSeconds:1});
  expect(study.engine).toEqual({name:'ris-simulation-study',version:'1'});
  expect(study.scenarioHash).toBe(scenario.scenarioHash);
  expect(study.robot.run.trace.schemaVersion).toBe('ris-event-trace/1');
  expect(study.baseline.run.trace.schemaVersion).toBe('ris-event-trace/1');
  expect(study.robot.experiment.replications).toBe(5);
  expect(study.baseline.experiment.replications).toBe(5);
  expect(study.robot.run.metrics.created).toBeGreaterThan(0);
  expect(study.baseline.run.metrics.created).toBe(study.robot.run.metrics.created);
 });
 it('uses a distinct baseline mobile-resource model while preserving facility/process/workload',()=>{
  const scenario=compileLegacyScenario(createScenario('airport'));
  const study=runSimulationCoreStudy({scenario,robotId:'legacy-robot',baseline,replications:5,safetyClearanceMeters:.2,samplePeriodSeconds:1});
  expect(study.baseline.scenarioHash).not.toBe(study.robot.scenarioHash);
  expect(study.baseline.run.engine.name).toBe('simcore-process');
  expect(study.baseline.config.workers).toBe(4);
 });
 it('bounds edge compute cost before execution',()=>{
  const scenario=compileLegacyScenario(createScenario('warehouse'));
  const parsed=simulationStudyRequestSchema.safeParse({scenario:{...scenario,workload:{...scenario.workload,demandPerHour:10000,shiftHours:24}},robotId:'legacy-robot',baseline,replications:30,safetyClearanceMeters:.2,samplePeriodSeconds:1});
  expect(parsed.success).toBe(false);
 });
 it('rejects a cyclic rework study that exceeds the transition budget',()=>{
  const scenario=structuredClone(compileLegacyScenario(createScenario('factory')));
  scenario.process.nodes.push({id:'decision',label:'Decision',kind:'decision',properties:{}});
  scenario.process.edges=[
   {id:'e1',from:'source',to:'decision',mode:'flow'},
   {id:'pass',from:'decision',to:'sink',mode:'flow',probability:.9},
   {id:'rework',from:'decision',to:'decision',mode:'flow',probability:.1},
  ];
  scenario.workload={...scenario.workload,demandPerHour:200,shiftHours:8};
  const parsed=simulationStudyRequestSchema.safeParse({scenario,robotId:'legacy-robot',baseline,replications:5,safetyClearanceMeters:.2,samplePeriodSeconds:1});
  expect(parsed.success).toBe(false);
  if(!parsed.success)expect(parsed.error.issues.map(issue=>issue.message).join(' ')).toMatch(/transition budget/i);
 });
 it('rejects a very long acyclic study that exceeds the transition budget',()=>{
  const scenario=structuredClone(compileLegacyScenario(createScenario('factory')));
  const source=scenario.process.nodes.find(node=>node.kind==='source')!;
  const sink=scenario.process.nodes.find(node=>node.kind==='sink')!;
  const middle=Array.from({length:220},(_,index)=>({
   id:'step-'+index,label:'Step '+index,kind:'process' as const,durationSeconds:1,properties:{},
  }));
  scenario.process.nodes=[source,...middle,sink];
  scenario.process.edges=[
   {id:'start',from:source.id,to:middle[0].id,mode:'flow'},
   ...middle.slice(0,-1).map((node,index)=>({id:'m-'+index,from:node.id,to:middle[index+1].id,mode:'flow' as const})),
   {id:'finish',from:middle.at(-1)!.id,to:sink.id,mode:'flow'},
  ];
  scenario.workload={...scenario.workload,demandPerHour:50,shiftHours:8};
  const parsed=simulationStudyRequestSchema.safeParse({scenario,robotId:'legacy-robot',baseline,replications:5,safetyClearanceMeters:.2,samplePeriodSeconds:1});
  expect(parsed.success).toBe(false);
  if(!parsed.success)expect(parsed.error.issues.map(issue=>issue.message).join(' ')).toMatch(/transition budget/i);
 });
});

describe('Simulation Core investment assessment',()=>{
 const finance={robotUnitPrice:1900000,integration:400000,infrastructure:300000,maintenancePerRobotYear:120000,electricityPerKwh:9,baselineAnnualCost:5000000,residualHumanAnnualCost:900000,workdays:250,horizonYears:5,discountRatePercent:12,annualRequiredJobs:1000};
 it('blocks investment output for unvalidated site geometry',()=>{
  const scenario=compileLegacyScenario(createScenario('factory'));
  const study=runSimulationCoreStudy({scenario,robotId:'legacy-robot',baseline,replications:5,safetyClearanceMeters:.2,samplePeriodSeconds:1});
  const dto=simulationCoreStudyDtoSchema.parse(toSimulationCoreStudyDto(study));
  const result=assessSimulationCoreStudyDto(dto,finance,{siteSpecific:false,dimensionsConfirmed:false,geometryStatus:'template'});
  expect(result.comparable).toBe(false);
  expect(result.roiPercent).toBeNull();
  expect(result.warnings.join(' ')).toMatch(/геометр/i);
 });
 it('uses conservative completed confidence bounds when approving capacity',()=>{
  const scenario=compileLegacyScenario(createScenario('hospital'));
  const study=runSimulationCoreStudy({scenario,robotId:'legacy-robot',baseline,replications:5,safetyClearanceMeters:.2,samplePeriodSeconds:1});
  const dto=simulationCoreStudyDtoSchema.parse(toSimulationCoreStudyDto(study));
  const result=assessSimulationCoreStudyDto(dto,finance,{siteSpecific:true,dimensionsConfirmed:true,geometryStatus:'validated'});
  expect(result.robotAnnualCompletedConservative).toBeGreaterThan(0);
  expect(result.baselineAnnualCompletedConservative).toBeGreaterThan(0);
  expect(result.comparable).toBe(true);
  expect(result.roiPercent).not.toBeNull();
 });
});
