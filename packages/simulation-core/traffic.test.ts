import {describe,expect,it} from 'vitest';
import {ReservationTable} from './traffic';

describe('Exclusive traffic resource reservations',()=>{
 it('serializes overlapping requests on the same resource',()=>{
  const table=new ReservationTable();
  const a=table.reserve({resourceId:'corridor:A-B',ownerId:'R1',earliestStart:0,duration:5});
  const b=table.reserve({resourceId:'corridor:A-B',ownerId:'R2',earliestStart:2,duration:4});
  const c=table.reserve({resourceId:'corridor:A-B',ownerId:'R3',earliestStart:3,duration:1});
  expect(a).toMatchObject({start:0,end:5,waitSeconds:0});
  expect(b).toMatchObject({start:5,end:9,waitSeconds:3});
  expect(c).toMatchObject({start:9,end:10,waitSeconds:6});
 });
 it('allows unrelated resources to run concurrently and adjacent reservations to touch',()=>{
  const table=new ReservationTable();
  expect(table.reserve({resourceId:'door:A',ownerId:'R1',earliestStart:0,duration:5}).start).toBe(0);
  expect(table.reserve({resourceId:'door:B',ownerId:'R2',earliestStart:1,duration:5}).start).toBe(1);
  expect(table.reserve({resourceId:'door:A',ownerId:'R3',earliestStart:5,duration:2}).start).toBe(5);
 });
 it('produces a snapshot with no overlap for each resource',()=>{
  const table=new ReservationTable();
  for(let i=0;i<40;i++)table.reserve({
   resourceId:i%2?'corridor:A-B':'door:X',ownerId:'R'+i,
   earliestStart:(i*7)%13,duration:1+(i%4),
  });
  const reservations=table.snapshot();
  for(const resource of new Set(reservations.map(r=>r.resourceId))){
   const own=reservations.filter(r=>r.resourceId===resource).sort((a,b)=>a.start-b.start);
   for(let i=1;i<own.length;i++)expect(own[i].start).toBeGreaterThanOrEqual(own[i-1].end);
  }
 });
 it('rejects invalid reservation requests',()=>{
  const table=new ReservationTable();
  expect(()=>table.reserve({resourceId:'',ownerId:'R',earliestStart:0,duration:1})).toThrow();
  expect(()=>table.reserve({resourceId:'x',ownerId:'R',earliestStart:-1,duration:1})).toThrow();
  expect(()=>table.reserve({resourceId:'x',ownerId:'R',earliestStart:0,duration:0})).toThrow();
 });
});
