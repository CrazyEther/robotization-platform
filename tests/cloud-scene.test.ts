import {describe,expect,it} from 'vitest';
import {createScenario,gridRoute} from '../packages/ris/contracts';
import {applySceneTool,importSceneLayout,sampleRobot,scenarioTemplate} from '../packages/ris/scene';
describe('Editable AnyLogic scene and actual-output replay',()=>{
 it('has independent warehouse, hospital, airport and factory templates',()=>{
  const wh=scenarioTemplate('warehouse'),hospital=scenarioTemplate('hospital'),airport=scenarioTemplate('airport');
  expect(wh.sector).toBe('warehouse');expect(hospital.sector).toBe('hospital');expect(airport.sector).toBe('airport');
  expect(gridRoute(wh.layout)?.distance).toBeGreaterThan(0);
  expect(gridRoute(hospital.layout)?.distance).toBeGreaterThan(0);
  expect(gridRoute(airport.layout)?.distance).toBeGreaterThan(0);
  expect(scenarioTemplate('factory').sector).toBe('factory');
 });
 it('adds/moves/removes obstacles but never overwrites pickup or dropoff',()=>{
  const base=createScenario('warehouse').layout;
  const blocked=applySceneTool(base,'add',{x:10,y:10});
  expect(blocked.obstacles.length).toBe(base.obstacles.length+1);
  expect(applySceneTool(blocked,'remove',{x:10,y:10}).obstacles).toEqual(base.obstacles);
  expect(applySceneTool(base,'add',base.pickup)).toEqual(base);
  expect(applySceneTool(base,'pickup',{x:12,y:10}).pickup).toEqual({x:12,y:10});
  expect(applySceneTool(base,'pickup',base.dropoff)).toEqual(base);
 });
 it('imports a measured room JSON only after validating geometry',()=>{
  const source=createScenario('airport').layout;
  expect(importSceneLayout(JSON.stringify(source))).toEqual(source);
  expect(importSceneLayout(JSON.stringify({layout:source}))).toEqual(source);
  expect(()=>importSceneLayout('not json')).toThrow();
  expect(()=>importSceneLayout(JSON.stringify({...source,width:2}))).toThrow();
 });
 it('interpolates measured robot trace, without synthesizing missing coordinates',()=>{
  const points=[{robotId:'r1',t:0,x:0,y:0,state:'loading'},{robotId:'r1',t:10,x:10,y:0,state:'moving'},{robotId:'r2',t:0,x:2,y:2,state:'idle'}];
  expect(sampleRobot(points,5,'r1')).toEqual({x:5,y:0,state:'moving'});
  expect(sampleRobot(points,8,'r2')).toEqual({x:2,y:2,state:'idle'});
  expect(sampleRobot([],5,'r1')).toBeNull();
 });
});
