export type ReservationRequest={
 resourceId:string;ownerId:string;earliestStart:number;duration:number;
};
export type Reservation={
 resourceId:string;ownerId:string;start:number;end:number;waitSeconds:number;
};

const MAX_RESERVATIONS=1_000_000;
const finite=(value:number,name:string)=>{
 if(!Number.isFinite(value))throw new RangeError(name+' must be finite');
 return value;
};

export class ReservationTable{
 private readonly byResource=new Map<string,Reservation[]>();
 private count=0;

 private plan(request:ReservationRequest):Reservation{
  if(!request.resourceId.trim()||!request.ownerId.trim())throw new Error('Reservation resourceId and ownerId are required');
  const earliest=finite(request.earliestStart,'earliestStart');
  const duration=finite(request.duration,'duration');
  if(earliest<0||duration<=0)throw new RangeError('Reservation start must be >= 0 and duration > 0');
  const existing=this.byResource.get(request.resourceId)??[];
  let start=earliest,end=start+duration;
  for(const reservation of existing){
   if(end<=reservation.start)break;
   if(start>=reservation.end)continue;
   start=reservation.end;
   end=start+duration;
  }
  return {
   resourceId:request.resourceId,ownerId:request.ownerId,
   start,end,waitSeconds:start-earliest,
  };
 }

 preview(request:ReservationRequest):Reservation{
  return {...this.plan(request)};
 }

 reserve(request:ReservationRequest):Reservation{
  if(this.count>=MAX_RESERVATIONS)throw new RangeError('Reservation table safety limit exceeded');
  const result=this.plan(request);
  const existing=this.byResource.get(request.resourceId)??[];
  const {start}=result;
  let index=existing.findIndex(item=>start<item.start);
  if(index<0)index=existing.length;
  existing.splice(index,0,result);
  this.byResource.set(request.resourceId,existing);
  this.count++;
  return {...result};
 }

 snapshot():Reservation[]{
  return [...this.byResource.entries()]
   .sort(([a],[b])=>a.localeCompare(b))
   .flatMap(([,items])=>items.map(item=>({...item})));
 }
}
