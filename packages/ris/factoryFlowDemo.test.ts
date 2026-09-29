import {describe,expect,it} from 'vitest';
import {compileFactoryFlowScenario,createFactoryFlowSeed} from './factoryFlowDemo';
import {runProcessNetwork} from '../simulation-core/process-runtime';
import {compileScenario} from '../simulation-core/compiler';
import {buildSimulationCoreReplay} from './simulationCoreReplay';

const site={sourceType:'template' as const,sourceName:null,
 geometryStatus:'template' as const,dimensionsConfirmed:false,siteSpecific:false};

describe('Factory material flow',()=>{
 const setup=()=>{
  const seed=createFactoryFlowSeed();
  const scenario=compileFactoryFlowScenario({...seed,site,processingSeconds:110});
  return {seed,scenario};
 };
 it('models two material transport legs separated by machine service',()=>{
  const {scenario}=setup();
  expect(scenario.process.entityType).toBe('pallet');
  expect(scenario.process.edges.map(edge=>edge.mode)).toEqual(['transport','transport']);
  expect(scenario.process.nodes[1]).toMatchObject({kind:'process',durationSeconds:110,facilityObjectId:'demo-machine'});
  expect(scenario.facility.floors[0].objects.find(object=>object.id==='demo-raw-rack')).toMatchObject({kind:'rack',blocking:true});
  expect(scenario.facility.floors[0].objects.find(object=>object.id==='demo-machine')).toMatchObject({kind:'machine',capacity:1});
 });
 it('runs equipment, outbound jobs and material-carrying robot movement in one timeline',()=>{
  const {scenario}=setup();
  const result=runProcessNetwork(scenario,{transport:{
   robotId:scenario.robots[0].id,safetyClearanceMeters:.2,samplePeriodSeconds:2,
  }});
  expect(result.metrics.completed).toBeGreaterThan(0);
  expect(result.metrics.transportDistanceMeters).toBeGreaterThan(0);
  const events=result.trace.events;
  const operation=events.find(event=>event.type==='process.started'&&event.data?.nodeId==='machine-operation');
  expect(operation).toBeDefined();
  const completedOperation=events.find(event=>event.type==='process.completed'&&event.taskId===operation?.taskId&&event.data?.nodeId==='machine-operation');
  expect(completedOperation!.t-operation!.t).toBeCloseTo(110,6);
  const out=events.find(event=>event.type==='process.started'&&event.data?.edgeId==='outbound-pallet'&&event.taskId===operation?.taskId);
  expect(out?.t).toBeGreaterThanOrEqual(completedOperation!.t);
  const entityEvents=events.filter(event=>event.taskId===operation?.taskId&&event.type.startsWith('entity.'));
  const inboundLoad=entityEvents.find(event=>event.type==='entity.loaded'&&event.data?.edgeId==='inbound-pallet')!;
  const outboundLoad=entityEvents.find(event=>event.type==='entity.loaded'&&event.data?.edgeId==='outbound-pallet')!;
  expect(inboundLoad.entityId).not.toBe(outboundLoad.entityId);
  expect(entityEvents.filter(event=>event.type==='entity.created')).toHaveLength(2);
  expect(entityEvents.some(event=>event.type==='entity.consumed')).toBe(true);
  expect(entityEvents.find(event=>event.type==='entity.completed')?.entityId).toBe(outboundLoad.entityId);
  const frames=buildSimulationCoreReplay(scenario,result.trace);
  const rawCargo=frames.find(frame=>frame.cargos.some(cargo=>cargo.id===inboundLoad.entityId&&cargo.phase==='input'));
  const loadedCargo=frames.find(frame=>frame.cargos.some(cargo=>cargo.id===inboundLoad.entityId&&cargo.phase==='loaded'));
  const machineCargo=frames.find(frame=>frame.cargos.some(cargo=>cargo.id===inboundLoad.entityId&&cargo.phase==='processing'));
  const outgoingCargo=frames.find(frame=>frame.cargos.some(cargo=>cargo.id===outboundLoad.entityId&&cargo.phase==='loaded'));
  expect(rawCargo).toBeDefined();
  expect(loadedCargo?.cargos.find(cargo=>cargo.id===inboundLoad.entityId)?.attachedRobotId).toBeTruthy();
  expect(machineCargo).toBeDefined();
  expect(outgoingCargo).toBeDefined();
  expect(frames.length).toBeGreaterThan(3);
 });
 it('higher machine processing time changes actual simulation throughput',()=>{
  const {seed}=setup();
  const fast=compileFactoryFlowScenario({...seed,site,processingSeconds:40});
  const slow=compileFactoryFlowScenario({...seed,site,processingSeconds:620});
  const options={transport:{robotId:fast.robots[0].id,safetyClearanceMeters:.2,samplePeriodSeconds:2}};
  const fastRun=runProcessNetwork(fast,options);
  const slowRun=runProcessNetwork(slow,options);
  expect(fastRun.metrics.completed).toBeGreaterThan(slowRun.metrics.completed);
  expect(fastRun.metrics.throughputPerHour).toBeGreaterThan(slowRun.metrics.throughputPerHour);
  expect(fastRun.trace.events.some(event=>event.type==='entity.completed')).toBe(true);
 });
 it('keeps the same material unit across a non-transforming service operation',()=>{
  const {scenario}=setup();
  const process=structuredClone(scenario.process);
  process.nodes[1].properties={transformsLoad:false};
  const unchanged=compileScenario({...scenario,process,scenarioHash:undefined});
  const result=runProcessNetwork(unchanged,{transport:{
   robotId:unchanged.robots[0].id,safetyClearanceMeters:.2,samplePeriodSeconds:2,
  }});
  const completed=result.trace.events.find(event=>event.type==='task.completed')!;
  const events=result.trace.events.filter(event=>event.taskId===completed.taskId);
  expect(events.filter(event=>event.type==='entity.created')).toHaveLength(1);
  expect(events.some(event=>event.type==='entity.consumed')).toBe(false);
  const transported=events.filter(event=>event.type==='entity.loaded');
  expect(transported.map(event=>event.entityId)).toEqual([transported[0].entityId,transported[0].entityId]);
 });
 it('refuses to run if the machine is removed',()=>{
  const {seed}=setup();
  expect(()=>compileFactoryFlowScenario({...seed,
   objects:seed.objects.filter(object=>object.id!=='demo-machine'),
   site,processingSeconds:110,
  })).toThrow(/machine station is missing/);
 });
});
