import {createSeededRandom} from './random';

export type ReliabilitySpec={
 model:'fixed'|'exponential';
 mtbfSeconds:number;
 mttrSeconds:number;
};
export type DowntimeWindow={start:number;end:number};

const validate=(spec:ReliabilitySpec,horizon:number)=>{
 if(!Number.isFinite(horizon)||horizon<0)throw new RangeError('Reliability horizon must be finite and >= 0');
 if(!Number.isFinite(spec.mtbfSeconds)||spec.mtbfSeconds<=0)throw new RangeError('MTBF must be finite and > 0');
 if(!Number.isFinite(spec.mttrSeconds)||spec.mttrSeconds<=0)throw new RangeError('MTTR must be finite and > 0');
};
export function generateDowntimeWindows(
 spec:ReliabilitySpec,horizonSeconds:number,seed:number,
):DowntimeWindow[]{
 validate(spec,horizonSeconds);
 const random=createSeededRandom(seed);
 const result:DowntimeWindow[]=[];
 let cursor=0;
 while(true){
  const uptime=spec.model==='fixed'
   ?spec.mtbfSeconds
   :-Math.log(Math.max(Number.MIN_VALUE,1-random()))*spec.mtbfSeconds;
  const start=cursor+uptime;
  if(start>horizonSeconds)break;
  const end=start+spec.mttrSeconds;
  result.push({start,end});
  cursor=end;
  if(result.length>100000)throw new RangeError('Reliability window safety limit exceeded');
 }
 return result;
}
export function nextOperationalTime(at:number,windows:DowntimeWindow[]):number{
 if(!Number.isFinite(at)||at<0)throw new RangeError('Operational time must be finite and >= 0');
 let cursor=at;
 for(const window of windows){
  if(cursor>=window.start&&cursor<window.end)cursor=window.end;
  if(window.start>cursor)break;
 }
 return cursor;
}

export function operationalSeconds(start:number,end:number,windows:DowntimeWindow[]):number{
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw new RangeError('Invalid operational interval');
 let available=end-start;
 for(const window of windows){
  const overlap=Math.max(0,Math.min(end,window.end)-Math.max(start,window.start));
  available-=overlap;
 }
 return Math.max(0,available);
}

export function serviceCompletionTime(start:number,duration:number,windows:DowntimeWindow[]):number{
 if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<0)
  throw new RangeError('Service start/duration must be finite and nonnegative');
 let cursor=start,remaining=duration;
 for(const window of windows){
  if(window.end<=cursor)continue;
  if(cursor>=window.start&&cursor<window.end)cursor=window.end;
  if(window.start>=cursor+remaining)return cursor+remaining;
  const usable=Math.max(0,window.start-cursor);
  remaining-=Math.min(remaining,usable);
  cursor=Math.max(cursor+usable,window.end);
  if(remaining<=0)return cursor;
 }
 return cursor+remaining;
}
