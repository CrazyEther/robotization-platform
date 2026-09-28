import {describe,expect,it} from 'vitest';
import {generateArrivalTimes} from './workload';
import type {SimulationScenarioV2} from './contracts';

type Workload=SimulationScenarioV2['workload'];
const base:Workload={demandPerHour:360,unitLoadKg:1,shiftHours:1,arrivalProcess:'fixed',seed:42};

describe('Workload arrival generator',()=>{
 it('produces exact fixed intervals inside the horizon',()=>{
  expect(generateArrivalTimes(base,60)).toEqual([0,10,20,30,40,50]);
 });
 it('replays Poisson arrivals exactly for the same seed',()=>{
  const workload={...base,demandPerHour:30,arrivalProcess:'poisson' as const,seed:123};
  const a=generateArrivalTimes(workload,3600);
  const b=generateArrivalTimes(workload,3600);
  expect(a).toEqual(b);
  expect(a.length).toBeGreaterThan(0);
  expect(a.every((t,i)=>t>=0&&t<3600&&(i===0||t>a[i-1]))).toBe(true);
 });
 it('changes the Poisson trace when the seed changes',()=>{
  const a=generateArrivalTimes({...base,arrivalProcess:'poisson',seed:1},600);
  const b=generateArrivalTimes({...base,arrivalProcess:'poisson',seed:2},600);
  expect(a).not.toEqual(b);
 });
 it('enforces the task safety limit',()=>{
  expect(()=>generateArrivalTimes({...base,demandPerHour:3600},10,2)).toThrow(/limit/i);
 });
});
