import {describe,expect,it} from 'vitest';
import {assessCycleEnergy,chargeDurationSeconds,motionEnergyWh} from './energy';

describe('Battery and energy invariants',()=>{
 const battery={capacityWh:2000,minSoc:.2,chargeW:1000,whPerMeter:.5};
 it('computes distance energy exactly from the declared Wh/m coefficient',()=>{
  expect(motionEnergyWh(125,battery)).toBeCloseTo(62.5,12);
 });
 it('preserves minimum SOC reserve in a feasible cycle',()=>{
  const result=assessCycleEnergy({battery,loadedMeters:500,emptyMeters:500});
  expect(result.consumptionWh).toBeCloseTo(500,12);
  expect(result.reserveWh).toBeCloseTo(400,12);
  expect(result.energyAfterWh).toBeCloseTo(1500,12);
  expect(result.socAfter).toBeCloseTo(.75,12);
  expect(result.feasible).toBe(true);
 });
 it('marks a cycle infeasible when it would cross the minimum SOC reserve',()=>{
  const result=assessCycleEnergy({battery,loadedMeters:1700,emptyMeters:1700});
  expect(result.consumptionWh).toBeCloseTo(1700,12);
  expect(result.energyAfterWh).toBeCloseTo(300,12);
  expect(result.feasible).toBe(false);
 });
 it('computes constant-power charging time with unit consistency',()=>{
  expect(chargeDurationSeconds({fromWh:500,toWh:1000,chargeW:1000})).toBeCloseTo(1800,12);
  expect(chargeDurationSeconds({fromWh:1000,toWh:1000,chargeW:1000})).toBe(0);
 });
 it('supports measured current energy without silently clamping invalid state',()=>{
  const result=assessCycleEnergy({battery,loadedMeters:100,emptyMeters:100,startEnergyWh:700});
  expect(result.energyAfterWh).toBeCloseTo(600,12);
  expect(result.feasible).toBe(true);
  expect(()=>assessCycleEnergy({battery,loadedMeters:1,emptyMeters:1,startEnergyWh:2100})).toThrow();
 });
 it('rejects nonphysical energy and charging parameters',()=>{
  expect(()=>motionEnergyWh(-1,battery)).toThrow();
  expect(()=>chargeDurationSeconds({fromWh:10,toWh:5,chargeW:100})).toThrow();
  expect(()=>chargeDurationSeconds({fromWh:0,toWh:5,chargeW:0})).toThrow();
 });
});
