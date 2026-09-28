import {describe,expect,it} from 'vitest';
import {ChargingScheduler} from './charging';

describe('Charging channel scheduler',()=>{
 it('selects the earliest finishing charger channel without mutating previews',()=>{
  const scheduler=new ChargingScheduler();
  const first=scheduler.reserveBest('R1',[
   {chargerId:'c1',capacity:1,arrivalTime:0,chargeSeconds:10,postChargeSeconds:4},
   {chargerId:'c2',capacity:1,arrivalTime:2,chargeSeconds:5,postChargeSeconds:10},
  ]);
  expect(first).toMatchObject({chargerId:'c1',channelId:'charger:c1#1',start:0,end:10,waitSeconds:0});
  const preview=scheduler.previewBest('R2',[
   {chargerId:'c1',capacity:1,arrivalTime:3,chargeSeconds:4,postChargeSeconds:0},
  ]);
  expect(preview).toMatchObject({start:10,end:14,waitSeconds:7});
  expect(scheduler.snapshot()).toHaveLength(1);
 });
 it('uses declared parallel charger capacity',()=>{
  const scheduler=new ChargingScheduler();
  scheduler.reserveBest('R1',[{chargerId:'c',capacity:2,arrivalTime:0,chargeSeconds:10,postChargeSeconds:0}]);
  const second=scheduler.reserveBest('R2',[{chargerId:'c',capacity:2,arrivalTime:1,chargeSeconds:5,postChargeSeconds:0}]);
  expect(second.channelId).toBe('charger:c#2');
  expect(second.start).toBe(1);
  expect(second.waitSeconds).toBe(0);
 });
 it('queues on one channel and reports exact waiting time',()=>{
  const scheduler=new ChargingScheduler();
  scheduler.reserveBest('R1',[{chargerId:'c',capacity:1,arrivalTime:0,chargeSeconds:10,postChargeSeconds:0}]);
  const second=scheduler.reserveBest('R2',[{chargerId:'c',capacity:1,arrivalTime:2,chargeSeconds:3,postChargeSeconds:0}]);
  expect(second).toMatchObject({start:10,end:13,waitSeconds:8});
 });
 it('rejects invalid candidate capacities and durations',()=>{
  const scheduler=new ChargingScheduler();
  expect(()=>scheduler.reserveBest('R1',[{chargerId:'c',capacity:0,arrivalTime:0,chargeSeconds:1,postChargeSeconds:0}])).toThrow(/capacity/i);
  expect(()=>scheduler.reserveBest('R1',[{chargerId:'c',capacity:1,arrivalTime:0,chargeSeconds:0,postChargeSeconds:0}])).toThrow(/charge/i);
 });
});
