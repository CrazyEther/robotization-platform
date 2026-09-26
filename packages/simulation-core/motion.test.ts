import {describe,expect,it} from 'vitest';
import {eventTraceSchema} from './trace';
import {generateLinearMotionEvents,planRestToRestMotion,sampleMotion} from './motion';

describe('Deterministic single-robot motion',()=>{
 it('matches independent trapezoidal-profile oracle',()=>{
  const profile=planRestToRestMotion(10,{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1});
  expect(profile.kind).toBe('trapezoidal');
  expect(profile.accelDistanceMeters).toBeCloseTo(2,12);
  expect(profile.cruiseDistanceMeters).toBeCloseTo(6,12);
  expect(profile.decelDistanceMeters).toBeCloseTo(2,12);
  expect(profile.totalSeconds).toBeCloseTo(7,12);
 });
 it('matches independent triangular-profile oracle',()=>{
  const profile=planRestToRestMotion(2,{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1});
  expect(profile.kind).toBe('triangular');
  expect(profile.peakSpeedMps).toBeCloseTo(Math.SQRT2,12);
  expect(profile.totalSeconds).toBeCloseTo(2*Math.SQRT2,12);
  const asymmetric=planRestToRestMotion(5,{maxSpeedMps:3,accelerationMps2:2,decelerationMps2:1});
  expect(asymmetric.totalSeconds).toBeCloseTo(Math.sqrt(15),12);
 });
 it('conserves distance and respects speed limits at every phase boundary',()=>{
  const profile=planRestToRestMotion(10,{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1});
  const times=[0,profile.accelSeconds,profile.accelSeconds+profile.cruiseSeconds,profile.totalSeconds];
  const samples=times.map(t=>sampleMotion(profile,t));
  expect(samples[0]).toMatchObject({distanceMeters:0,velocityMps:0});
  expect(samples.at(-1)).toMatchObject({distanceMeters:10,velocityMps:0});
  expect(Math.max(...samples.map(x=>x.velocityMps))).toBeLessThanOrEqual(2);
  expect(samples.map(x=>x.distanceMeters)).toEqual([...samples.map(x=>x.distanceMeters)].sort((a,b)=>a-b));
 });
 it('generates a monotone linear EventTrace-compatible replay ending exactly at the target',()=>{
  const events=generateLinearMotionEvents({
   idPrefix:'run1',resourceId:'robot-1',floorId:'floor-1',
   start:{x:1,y:2},end:{x:7,y:10},startTimeSeconds:5,samplePeriodSeconds:.5,
   kinematics:{maxSpeedMps:2,accelerationMps2:1,decelerationMps2:1},
  });
  expect(events[0]).toMatchObject({t:5,type:'robot.motion',resourceId:'robot-1',position:{floorId:'floor-1',x:1,y:2}});
  expect(events.at(-1)?.position).toMatchObject({floorId:'floor-1',x:7,y:10});
  expect(events.at(-1)?.data?.velocityMps).toBe(0);
  for(let i=1;i<events.length;i++)expect(events[i].t).toBeGreaterThan(events[i-1].t);
 });

 it('satisfies distance and speed invariants across a parameter grid',()=>{
  for(const distance of [.1,.5,1,2,5,10,50]){
   for(const maxSpeedMps of [.2,.7,1.5,3]){
    for(const accelerationMps2 of [.2,1,2]){
     for(const decelerationMps2 of [.3,1,2.5]){
      const profile=planRestToRestMotion(distance,{maxSpeedMps,accelerationMps2,decelerationMps2});
      let previous=-1;
      for(let i=0;i<=40;i++){
       const sample=sampleMotion(profile,profile.totalSeconds*i/40);
       expect(sample.distanceMeters).toBeGreaterThanOrEqual(previous-1e-10);
       expect(sample.distanceMeters).toBeGreaterThanOrEqual(-1e-10);
       expect(sample.distanceMeters).toBeLessThanOrEqual(distance+1e-10);
       expect(sample.velocityMps).toBeGreaterThanOrEqual(-1e-10);
       expect(sample.velocityMps).toBeLessThanOrEqual(maxSpeedMps+1e-10);
       previous=sample.distanceMeters;
      }
      expect(sampleMotion(profile,profile.totalSeconds).distanceMeters).toBeCloseTo(distance,10);
     }
    }
   }
  }
 });
 it('emits events accepted by the canonical EventTrace schema',()=>{
  const events=generateLinearMotionEvents({
   idPrefix:'oracle',resourceId:'robot-1',floorId:'floor-1',
   start:{x:0,y:0},end:{x:3,y:4},startTimeSeconds:0,samplePeriodSeconds:.25,
   kinematics:{maxSpeedMps:1.5,accelerationMps2:.8,decelerationMps2:1.1},
  });
  const trace=eventTraceSchema.parse({
   schemaVersion:'ris-event-trace/1',scenarioHash:'fnv1a64:0000000000000001',
   engine:{name:'simcore-motion',version:'0.1.0'},startedAt:'2026-09-27T00:00:00Z',events,
  });
  expect(trace.events).toHaveLength(events.length);
 });

 it('rejects nonphysical kinematics and zero/negative distances',()=>{
  expect(()=>planRestToRestMotion(0,{maxSpeedMps:1,accelerationMps2:1,decelerationMps2:1})).toThrow();
  expect(()=>planRestToRestMotion(1,{maxSpeedMps:0,accelerationMps2:1,decelerationMps2:1})).toThrow();
 });
});
