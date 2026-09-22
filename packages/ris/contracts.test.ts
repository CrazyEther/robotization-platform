import {describe,expect,it} from 'vitest';
import {createScenario,evaluateInvestment,gridRoute,type FinanceInput,type SimulationResult} from './contracts';

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
});
