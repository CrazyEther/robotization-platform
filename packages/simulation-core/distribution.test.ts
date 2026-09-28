import {describe,expect,it} from 'vitest';
import {createSeededRandom} from './random';
import {sampleDurationSeconds} from './distribution';

describe('Service-time distributions',()=>{
 it('samples fixed and empirical models deterministically',()=>{
  const random=createSeededRandom(42);
  expect(sampleDurationSeconds({kind:'fixed',seconds:12},random)).toBe(12);
  const values=[5,10,20];
  const a=Array.from({length:8},()=>sampleDurationSeconds({kind:'empirical',valuesSeconds:values},random));
  const replay=createSeededRandom(42);
  sampleDurationSeconds({kind:'fixed',seconds:12},replay);
  const b=Array.from({length:8},()=>sampleDurationSeconds({kind:'empirical',valuesSeconds:values},replay));
  expect(a).toEqual(b);
  expect(a.every(v=>values.includes(v))).toBe(true);
 });
 it('keeps uniform samples inside configured bounds',()=>{
  const random=createSeededRandom(7);
  const values=Array.from({length:1000},()=>sampleDurationSeconds({kind:'uniform',minSeconds:2,maxSeconds:8},random));
  expect(Math.min(...values)).toBeGreaterThanOrEqual(2);
  expect(Math.max(...values)).toBeLessThanOrEqual(8);
 });
 it('reproduces exponential mean with a deterministic large sample',()=>{
  const random=createSeededRandom(11);
  const values=Array.from({length:30000},()=>sampleDurationSeconds({kind:'exponential',meanSeconds:10},random));
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  expect(mean).toBeCloseTo(10,0);
 });
 it('uses lognormal median/sigma parameterization',()=>{
  const random=createSeededRandom(19),median=10,sigma=.4;
  const values=Array.from({length:30000},()=>sampleDurationSeconds({kind:'lognormal',medianSeconds:median,sigma},random));
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  expect(mean).toBeCloseTo(median*Math.exp(sigma*sigma/2),0);
 });
 it('uses gamma shape/scale parameterization',()=>{
  const random=createSeededRandom(23),shape=2.5,scale=4;
  const values=Array.from({length:30000},()=>sampleDurationSeconds({kind:'gamma',shape,scaleSeconds:scale},random));
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  expect(mean).toBeCloseTo(shape*scale,0);
 });
});
