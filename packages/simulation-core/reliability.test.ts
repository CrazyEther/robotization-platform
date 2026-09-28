import {describe,expect,it} from 'vitest';
import {generateDowntimeWindows,nextOperationalTime,serviceCompletionTime,operationalSeconds} from './reliability';

describe('Reliability model',()=>{
 it('builds deterministic fixed MTBF/MTTR downtime windows',()=>{
  const windows=generateDowntimeWindows({model:'fixed',mtbfSeconds:10,mttrSeconds:5},40,123);
  expect(windows).toEqual([{start:10,end:15},{start:25,end:30},{start:40,end:45}]);
 });
 it('replays exponential failures for the same seed',()=>{
  const spec={model:'exponential' as const,mtbfSeconds:20,mttrSeconds:4};
  expect(generateDowntimeWindows(spec,200,7)).toEqual(generateDowntimeWindows(spec,200,7));
  expect(generateDowntimeWindows(spec,200,7)).not.toEqual(generateDowntimeWindows(spec,200,8));
 });
 it('moves queued work to the end of an active repair window',()=>{
  const windows=[{start:10,end:20},{start:30,end:40}];
  expect(nextOperationalTime(12,windows)).toBe(20);
  expect(nextOperationalTime(20,windows)).toBe(20);
  expect(nextOperationalTime(35,windows)).toBe(40);
 });
 it('pauses service during downtime and resumes afterwards',()=>{
  const windows=[{start:10,end:20},{start:30,end:40}];
  expect(serviceCompletionTime(0,30,windows)).toBe(50);
  expect(serviceCompletionTime(12,5,windows)).toBe(25);
 });
 it('counts only operational time inside an interval',()=>{
  const windows=[{start:10,end:20},{start:30,end:40}];
  expect(operationalSeconds(0,50,windows)).toBe(30);
  expect(operationalSeconds(12,18,windows)).toBe(0);
  expect(operationalSeconds(18,35,windows)).toBe(10);
 });
});
