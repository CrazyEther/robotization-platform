import {describe,expect,it} from 'vitest';
import {createScenario,evaluateInvestment,evaluateExperimentInvestment,experimentResultSchema,gridRoute,type ExperimentResult,type FinanceInput,type SimulationResult} from './contracts';

const sim:SimulationResult={engine:'SimPy',engineVersion:'test',status:'complete',routeMeters:18,created:100,completed:100,backlog:0,throughputPerHour:12.5,meanQueueMinutes:1,meanJobSeconds:95,p95JobSeconds:112,robotUtilization:.7,chargerUtilization:.2,distanceMeters:1800,loadedMeters:900,emptyMeters:900,energyKwh:10,chargingHours:0,warnings:[],inputHash:'fixture',wallTimeMs:10};
const finance:FinanceInput={unitPrice:1000000,installation:250000,infrastructure:50000,chargersCost:100000,maintenanceAnnual:300000,electricityPerKwh:10,baselineCostAnnual:5000000,residualHumanCostAnnual:1000000,daysPerYear:250,horizonYears:5,discountRatePercent:10,annualDemand:22000,baselineAnnualCompleted:25000};

describe('RIS spatial model and investment guard',()=>{
 it('builds traversable sector templates and refuses an impossible route',()=>{
  for(const sector of ['warehouse','factory','hospital','airport'] as const)expect(gridRoute(createScenario(sector).layout)?.distance).toBeGreaterThan(0);
  const s=createScenario('warehouse');s.layout.obstacles=[{x:20,y:0,w:1,h:s.layout.height}];expect(gridRoute(s.layout)).toBeNull();
 });
 it('derives ROI from measured costs only when throughput is comparable',()=>{
  const s=createScenario('warehouse');const good=evaluateInvestment(s,sim,finance);
  expect(good.comparable).toBe(true);expect(good.capex).toBe(3400000);
  expect(good.annualOpex).toBe(325000);expect(good.annualSaving).toBe(4000000);
  expect(good.roiPercent).toBeCloseTo((3675000*5-3400000)/3400000*100);
  const incomplete=evaluateInvestment(s,sim,{...finance,annualDemand:28000});
  expect(incomplete.roiPercent).toBeNull();expect(incomplete.npv).toBeNull();
 });
 it('rejects negative expenses and does not monetise time automatically',()=>{
  expect(()=>evaluateInvestment(createScenario('warehouse'),sim,{...finance,maintenanceAnnual:-1})).toThrow();
  expect(evaluateInvestment(createScenario('warehouse'),sim,{...finance,baselineCostAnnual:0}).roiPercent).toBeNull();
 });
 it('does not claim investment viability when replication uncertainty crosses required throughput',()=>{
  const metrics={completed:{mean:100,low95:80,high95:120,stddev:20,samples:8},energyKwh:{mean:10,low95:8,high95:12,stddev:2,samples:8},backlog:{mean:4,low95:2,high95:6,stddev:2,samples:8}};
  const experiment={replications:8,runs:Array.from({length:8},(_,i)=>({...sim,completed:i%2===0?70:110})),metrics} as unknown as ExperimentResult;
  const estimate=evaluateExperimentInvestment(createScenario('warehouse'),experiment,finance);
  expect(estimate.annualCompleted).toBe(25000);
  expect(estimate.comparable).toBe(false);
  expect(estimate.roiPercent).toBeNull();
  expect(estimate.npv).toBeNull();
  expect(estimate.warnings.join(' ')).toMatch(/неопредел|разброс|прогон/i);
 });
 it('requires multiple replications for stochastic financial conclusions',()=>{
  const experiment={replications:1,runs:[sim],metrics:{completed:{mean:100,low95:100,high95:100,stddev:0,samples:1},energyKwh:{mean:10,low95:10,high95:10,stddev:0,samples:1},backlog:{mean:0,low95:0,high95:0,stddev:0,samples:1}}} as unknown as ExperimentResult;
  const casePoisson=createScenario('warehouse');casePoisson.mode='poisson';
  expect(evaluateExperimentInvestment(casePoisson,experiment,finance).roiPercent).toBeNull();
  expect(evaluateExperimentInvestment(createScenario('warehouse'),experiment,finance).comparable).toBe(true);
 });

 it('accepts valid experiments where a low-throughput replication finishes no jobs',()=>{
  const names=['created','completed','backlog','throughputPerHour','meanQueueMinutes','meanJobSeconds','p95JobSeconds','robotUtilization','chargerUtilization','energyKwh','distanceMeters','loadedMeters','emptyMeters','chargingHours'];
  const metrics=Object.fromEntries(names.map(name=>[name,{mean:100,low95:80,high95:120,stddev:4,samples:2}]));
  metrics.meanJobSeconds={mean:95,low95:95,high95:95,stddev:0,samples:1};
  metrics.p95JobSeconds={mean:95,low95:95,high95:95,stddev:0,samples:1};
  const response={status:'complete',engine:'SimPy',engineVersion:'test',replications:2,seeds:[42,1051],metrics,runs:[{...sim,inputHash:'a'.repeat(64)},{...sim,inputHash:'b'.repeat(64),completed:0,meanJobSeconds:null,p95JobSeconds:null}]};
  expect(experimentResultSchema.safeParse(response).success).toBe(true);
 });
});
