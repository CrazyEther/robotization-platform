import {describe,expect,it} from 'vitest';
import {createScenario} from './contracts';
import {compileLegacyScenario} from './legacySimulationCoreAdapter';
import {runSimulationCoreStudy} from './simulationCoreStudy';
import {buildSimulationCoreReplay} from './simulationCoreReplay';

describe('Simulation Core replay adapter',()=>{
 it('builds cumulative multi-robot frames from canonical EventTrace',()=>{
  const scenario=compileLegacyScenario({...createScenario('hospital'),workload:{...createScenario('hospital').workload,shiftHours:.03,demandPerHour:120}});
  const study=runSimulationCoreStudy({
   scenario,robotId:'legacy-robot',baseline:{workers:4,speedMps:1.1,serviceSeconds:80},
   replications:1,safetyClearanceMeters:.2,samplePeriodSeconds:2,
  });
  const frames=buildSimulationCoreReplay(scenario,study.robot.run.trace);
  expect(frames.length).toBeGreaterThan(1);
  expect(frames[0].t).toBe(0);
  expect(frames[0].robots).toHaveLength(scenario.robots[0].fleetSize);
  expect(frames.at(-1)?.completed).toBe(study.robot.run.metrics.completed);
  expect(frames.at(-1)?.backlog).toBe(study.robot.run.metrics.created-study.robot.run.metrics.completed);
  expect(frames.some(frame=>frame.robots.some(robot=>robot.state==='loaded'||robot.state==='moving'))).toBe(true);
 });
 it('keeps every replay coordinate inside its floor and preserves robot identities',()=>{
  const scenario=compileLegacyScenario({...createScenario('factory'),workload:{...createScenario('factory').workload,shiftHours:.03,demandPerHour:120}});
  const study=runSimulationCoreStudy({
   scenario,robotId:'legacy-robot',baseline:{workers:3,speedMps:1,serviceSeconds:60},
   replications:1,safetyClearanceMeters:.2,samplePeriodSeconds:2,
  });
  const frames=buildSimulationCoreReplay(scenario,study.robot.run.trace);
  const ids=frames[0].robots.map(robot=>robot.id).sort().join(',');
  const floor=scenario.facility.floors[0];
  for(const frame of frames){
   expect(frame.robots.map(robot=>robot.id).sort().join(',')).toBe(ids);
   expect(frame.robots.every(robot=>robot.x>=0&&robot.x<=floor.widthMeters&&robot.y>=0&&robot.y<=floor.heightMeters)).toBe(true);
  }
 });
 it('caps browser replay frames without losing the final state',()=>{
  const scenario=compileLegacyScenario({...createScenario('airport'),workload:{...createScenario('airport').workload,shiftHours:.05,demandPerHour:180}});
  const study=runSimulationCoreStudy({
   scenario,robotId:'legacy-robot',baseline:{workers:4,speedMps:1,serviceSeconds:60},
   replications:1,safetyClearanceMeters:.2,samplePeriodSeconds:.2,
  });
  const frames=buildSimulationCoreReplay(scenario,study.robot.run.trace,{maxFrames:20});
  expect(frames.length).toBeLessThanOrEqual(20);
  expect(frames.at(-1)?.completed).toBe(study.robot.run.metrics.completed);
 });
});
