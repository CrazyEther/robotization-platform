import {describe,expect,it} from 'vitest';
import {compileScenario} from './compiler';
import {runProcessExperiment,summarizeSamples} from './experiment';
import type {SimulationScenarioV2} from './contracts';

function processScenario(seed=42):SimulationScenarioV2{
 return compileScenario({
  schemaVersion:'ris-simulation-scenario/2',id:'exp',name:'Experiment',profile:'factory',
  facility:{schemaVersion:'ris-facility/2',id:'facility',name:'Facility',unit:'m',
   source:{type:'manual',name:'test',geometryStatus:'validated',dimensionsConfirmed:true,siteSpecific:true},
   floors:[{id:'floor-1',label:'Floor',zMeters:0,widthMeters:20,heightMeters:20,objects:[
    {id:'start',label:'Start',kind:'station',geometry:{x:1,y:1,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
    {id:'machine',label:'Machine',kind:'machine',geometry:{x:5,y:5,w:2,h:2,rotationDeg:0},blocking:true,capacity:1,properties:{}},
    {id:'end',label:'End',kind:'station',geometry:{x:10,y:10,w:1,h:1,rotationDeg:0},blocking:false,capacity:1,properties:{}},
   ]}]},
  process:{schemaVersion:'ris-process/1',id:'p',name:'P',entityType:'part',nodes:[
   {id:'source',label:'Source',kind:'source',facilityObjectId:'start',properties:{}},
   {id:'work',label:'Work',kind:'process',facilityObjectId:'machine',
    durationModel:{kind:'exponential',meanSeconds:8},properties:{}},
   {id:'sink',label:'Sink',kind:'sink',facilityObjectId:'end',properties:{}},
  ],edges:[{id:'e1',from:'source',to:'work',mode:'flow'},{id:'e2',from:'work',to:'sink',mode:'flow'}]},
  robots:[{id:'r',label:'R',fleetSize:1,capacity:{payloadKg:10},
   kinematics:{maxSpeedMps:1,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:1,widthM:.7,heightM:.5},
   battery:{capacityWh:1000,chargeW:1000,whPerMeter:.1,minSoc:.1},
   handling:{loadSeconds:0,unloadSeconds:0},navigationType:'free-space'}],
  workload:{demandPerHour:360,unitLoadKg:1,shiftHours:120/3600,arrivalProcess:'poisson',seed},
 });
}

describe('Experiment statistics',()=>{
 it('uses sample standard deviation and Student-t confidence intervals',()=>{
  const summary=summarizeSamples([1,2,3,4,5]);
  expect(summary.mean).toBe(3);
  expect(summary.stddev).toBeCloseTo(Math.sqrt(2.5),10);
  expect(summary.low95).toBeCloseTo(1.0367568,5);
  expect(summary.high95).toBeCloseTo(4.9632432,5);
  expect(summary.p50).toBe(3);
  expect(summary.p95).toBe(5);
 });
 it('keeps uncertainty undefined for a single observation',()=>{
  expect(summarizeSamples([7])).toEqual({
   samples:1,mean:7,stddev:null,low95:null,high95:null,min:7,max:7,p5:7,p50:7,p95:7,
  });
 });
});

describe('Process experiments',()=>{
 it('replays the same experiment exactly for the same base scenario and replication count',()=>{
  const scenario=processScenario(77);
  const a=runProcessExperiment(scenario,{replications:8});
  const b=runProcessExperiment(scenario,{replications:8});
  expect(a).toEqual(b);
  expect(a.replications).toBe(8);
  expect(new Set(a.seeds).size).toBe(8);
  expect(a.runs).toHaveLength(8);
  expect(a.metrics.completed.samples).toBe(8);
  expect(a.metrics.throughputPerHour.low95).not.toBeNull();
 });
 it('changes stochastic runs across derived seeds while preserving base scenario identity',()=>{
  const result=runProcessExperiment(processScenario(91),{replications:6});
  expect(result.baseScenarioHash).toBe(processScenario(91).scenarioHash);
  expect(new Set(result.runs.map(run=>run.scenarioHash)).size).toBe(6);
  expect(new Set(result.runs.map(run=>run.metrics.completed)).size).toBeGreaterThan(1);
 });
 it('summarizes resource metrics using the same resource ids across all runs',()=>{
  const result=runProcessExperiment(processScenario(),{replications:5});
  expect(result.resources['machine'].utilization.samples).toBe(5);
  expect(result.resources['machine'].availability.mean).toBe(1);
  expect(result.resources['machine'].downtimeSeconds.mean).toBe(0);
 });
 it('rejects invalid replication counts before running',()=>{
  const scenario=processScenario();
  expect(()=>runProcessExperiment(scenario,{replications:0})).toThrow(/replication/i);
  expect(()=>runProcessExperiment(scenario,{replications:1001})).toThrow(/replication/i);
 });
});
