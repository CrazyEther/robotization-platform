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
