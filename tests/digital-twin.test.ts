import {describe,expect,it} from 'vitest';
import {createScenario} from '../packages/ris/contracts';
import {runDigitalTwin,runBaseline,compareDigitalTwin,processPresets} from '../packages/ris/digitalTwin';

describe('Digital twin execution uses trajectories as calculation evidence',()=>{
 it('simulates warehouse robots with frames, queues, traffic waits and energy',()=>{
  const scenario=createScenario('warehouse');
  scenario.workload.shiftHours=.5;
  scenario.workload.demandPerHour=40;
  scenario.robot.count=2;
  const result=runDigitalTwin({scenario,robotId:'mir250',frameStepSeconds:2});
  expect(result.engine).toBe('RIS Digital Twin');
  expect(result.frames.length).toBeGreaterThan(20);
  expect(result.created).toBeGreaterThan(0);
  expect(result.completed).toBeGreaterThan(0);
  expect(result.completed).toBeLessThanOrEqual(result.created);
  expect(result.energyKwh).toBeGreaterThan(0);
  expect(result.robotUtilization).toBeGreaterThan(0);
  expect(result.robots).toHaveLength(2);
  expect(result.frames.some(f=>f.robots.some(r=>r.state==='loaded'))).toBe(true);
  for(const frame of result.frames){const cells=frame.robots.map(r=>r.x+','+r.y);expect(new Set(cells).size).toBe(cells.length);}
  expect(result.timeline.length).toBeGreaterThan(3);
 });
 it('same seed and scene are reproducible',()=>{
  const scenario=createScenario('hospital');scenario.workload.shiftHours=.25;
  const a=runDigitalTwin({scenario,robotId:'omron-ld250',frameStepSeconds:2});
  const b=runDigitalTwin({scenario,robotId:'omron-ld250',frameStepSeconds:2});
  expect(a.completed).toBe(b.completed);
  expect(a.frames).toEqual(b.frames);
 });
 it('uses distinct process presets for warehouse hospital and airport',()=>{
  expect(processPresets.warehouse.task).toMatch(/пал/i);
  expect(processPresets.hospital.task).toMatch(/мед/i);
  expect(processPresets.airport.task).toMatch(/багаж/i);
  expect(new Set(Object.values(processPresets).map(x=>x.task)).size).toBe(4);
 });
 it('simulates baseline with the same demand and geometry',()=>{
  const scenario=createScenario('airport');scenario.workload.shiftHours=.25;
  const baseline=runBaseline({scenario,workers:2,speedMps:1.1,serviceSeconds:80});
  const robot=runDigitalTwin({scenario,robotId:'ronavi-h1500',frameStepSeconds:4});
  expect(baseline.created).toBe(robot.created);
  expect(baseline.completed).toBeGreaterThan(0);
  expect(baseline.meanQueueMinutes).toBeGreaterThanOrEqual(0);
 });
 it('only exposes ROI when baseline and robot scenario meet the same annual demand',()=>{
  const scenario=createScenario('warehouse');scenario.workload.shiftHours=.5;
  const baseline=runBaseline({scenario,workers:5,speedMps:1.2,serviceSeconds:40});
  const robot=runDigitalTwin({scenario,robotId:'mir250',frameStepSeconds:4});
  const finance={robotUnitPrice:1900000,integration:400000,infrastructure:300000,maintenancePerRobotYear:120000,electricityPerKwh:9,baselineAnnualCost:5000000,residualHumanAnnualCost:900000,workdays:250,horizonYears:5,discountRatePercent:12,annualRequiredJobs:1};
  const result=compareDigitalTwin({scenario,baseline,robot,finance});
  expect(result.comparable).toBe(true);
  expect(result.capex).toBeGreaterThan(0);
  expect(result.roiPercent).not.toBeNull();
  const blocked=compareDigitalTwin({scenario,baseline,robot,finance:{...finance,annualRequiredJobs:99999999}});
  expect(blocked.roiPercent).toBeNull();
 });
});
