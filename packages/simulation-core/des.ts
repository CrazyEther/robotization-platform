export type DesEvent<T>={at:number;priority:number;payload:T};
export type DesRunSummary={processed:number;pending:number;lastTime:number|null};

type HeapItem<T>=DesEvent<T>&{sequence:number};
const MAX_PROCESSED_EVENTS=2_000_000;
const validateEvent=<T>(event:DesEvent<T>)=>{
 if(!Number.isFinite(event.at)||event.at<0)throw new RangeError('DES event time must be finite and >= 0');
 if(!Number.isInteger(event.priority))throw new RangeError('DES event priority must be an integer');
};
const before=<T>(a:HeapItem<T>,b:HeapItem<T>)=>
 a.at<b.at||(a.at===b.at&&(a.priority<b.priority||(a.priority===b.priority&&a.sequence<b.sequence)));

class MinHeap<T>{
 private values:HeapItem<T>[]=[];
 get size(){return this.values.length;}
 push(item:HeapItem<T>){
  this.values.push(item);let index=this.values.length-1;
  while(index>0){const parent=Math.floor((index-1)/2);if(!before(this.values[index],this.values[parent]))break;
   [this.values[index],this.values[parent]]=[this.values[parent],this.values[index]];index=parent;}
 }
 peek(){return this.values[0];}
 pop():HeapItem<T>|undefined{
  if(!this.values.length)return undefined;
  const root=this.values[0],last=this.values.pop()!;
  if(this.values.length){this.values[0]=last;let index=0;
   while(true){const left=index*2+1,right=left+1;let next=index;
    if(left<this.values.length&&before(this.values[left],this.values[next]))next=left;
    if(right<this.values.length&&before(this.values[right],this.values[next]))next=right;
    if(next===index)break;[this.values[index],this.values[next]]=[this.values[next],this.values[index]];index=next;
   }}
  return root;
 }
}

export function runEventLoop<T>(
 initial:DesEvent<T>[],horizonSeconds:number,
 handler:(event:DesEvent<T>,schedule:(event:DesEvent<T>)=>void)=>void,
):DesRunSummary{
 if(!Number.isFinite(horizonSeconds)||horizonSeconds<0)throw new RangeError('DES horizon must be finite and >= 0');
 const heap=new MinHeap<T>();let sequence=0,currentTime=-Infinity,processed=0,lastTime:number|null=null;
 const enqueue=(event:DesEvent<T>)=>{validateEvent(event);heap.push({...event,sequence:sequence++});};
 initial.forEach(enqueue);
 while(heap.size){
  const next=heap.peek()!;if(next.at>horizonSeconds)break;
  const item=heap.pop()!;currentTime=item.at;lastTime=currentTime;processed++;
  if(processed>MAX_PROCESSED_EVENTS)throw new RangeError('DES processed-event safety limit exceeded');
  const schedule=(event:DesEvent<T>)=>{
   validateEvent(event);
   if(event.at<currentTime)throw new RangeError('Cannot schedule a DES event into the past');
   enqueue(event);
  };
  handler({at:item.at,priority:item.priority,payload:item.payload},schedule);
 }
 return {processed,pending:heap.size,lastTime};
}
