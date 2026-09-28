import {describe,expect,it} from 'vitest';
import {runEventLoop} from './des';

describe('Deterministic discrete-event queue',()=>{
 it('orders by time, then priority, then insertion sequence',()=>{
  const seen:string[]=[];
  runEventLoop([
   {at:2,priority:1,payload:'late'},
   {at:1,priority:2,payload:'p2'},
   {at:1,priority:1,payload:'p1-a'},
   {at:1,priority:1,payload:'p1-b'},
  ],3,(event)=>{seen.push(event.payload);});
  expect(seen).toEqual(['p1-a','p1-b','p2','late']);
 });
 it('allows handlers to schedule later events and stops at the horizon',()=>{
  const seen:number[]=[];
  const result=runEventLoop([{at:0,priority:0,payload:0}],2,(event,schedule)=>{
   seen.push(event.payload);
   schedule({at:event.at+1,priority:0,payload:event.payload+1});
  });
  expect(seen).toEqual([0,1,2]);
  expect(result.processed).toBe(3);
  expect(result.pending).toBe(1);
 });
 it('rejects invalid time and scheduling into the past',()=>{
  expect(()=>runEventLoop([{at:-1,priority:0,payload:'x'}],1,()=>{})).toThrow();
  expect(()=>runEventLoop([{at:1,priority:0,payload:'x'}],2,(event,schedule)=>{
   schedule({at:event.at-.1,priority:0,payload:'bad'});
  })).toThrow(/past/i);
 });
});
