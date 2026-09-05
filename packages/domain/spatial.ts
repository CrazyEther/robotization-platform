import {z} from 'zod';

const coordinate=z.number().finite().min(-100000).max(100000);
const vector=z.tuple([coordinate,coordinate,coordinate]);
const dimensions=z.tuple([z.number().positive().max(10000),z.number().positive().max(10000),z.number().positive().max(10000)]);
const source=z.string().trim().min(1).max(2048);
const id=z.string().trim().min(1).max(120);
export const spatialSchema=z.object({
 schemaVersion:z.literal(1),name:z.string().trim().min(1).max(200),unit:z.literal('m'),timeUnit:z.literal('s'),upAxis:z.literal('y'),
 sourceRef:source,observedAt:z.string().datetime({offset:true}),terms:source,
 bounds:z.object({min:vector,max:vector}).strict(),
 objects:z.array(z.object({id,label:z.string().max(200),kind:z.enum(['rack','conveyor','wall','station','zone']),position:vector,size:dimensions,sourceRef:source}).strict()).max(2000),
 robots:z.array(z.object({id,label:z.string().max(200),size:dimensions,sourceRef:source,samples:z.array(z.object({at:z.number().finite().nonnegative(),position:vector,sourceRef:source}).strict()).min(1).max(20000)}).strict()).max(200),
}).strict().superRefine((scene,ctx)=>{
 for(let i=0;i<3;i++)if(scene.bounds.max[i]<=scene.bounds.min[i])ctx.addIssue({code:'custom',message:'Границы объекта должны иметь положительный размер',path:['bounds']});
 const ids=[...scene.objects,...scene.robots].map(x=>x.id);if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Идентификаторы объектов должны быть уникальными'});
 const contains=(p:number[])=>p.every((n,i)=>n>=scene.bounds.min[i]&&n<=scene.bounds.max[i]);
 scene.objects.forEach((o,i)=>{if(!contains(o.position.map((v,j)=>v-o.size[j]/2))||!contains(o.position.map((v,j)=>v+o.size[j]/2)))ctx.addIssue({code:'custom',message:'Габариты выходят за границы объекта',path:['objects',i]});});
 scene.robots.forEach((r,i)=>r.samples.forEach((s,j)=>{if(!contains(s.position))ctx.addIssue({code:'custom',message:'Координата вне границ',path:['robots',i,'samples',j]});if(j&&s.at<=r.samples[j-1].at)ctx.addIssue({code:'custom',message:'Отметки времени должны строго возрастать',path:['robots',i,'samples',j]});}));
 if(scene.robots.reduce((sum,r)=>sum+r.samples.length,0)>100000)ctx.addIssue({code:'custom',message:'Не более 100 000 наблюдений в одной сцене'});
});
export type SpatialScene=z.infer<typeof spatialSchema>;
export type PositionSample=SpatialScene['robots'][number]['samples'][number];
/** No extrapolation: latest observation is returned only inside the recorded window. */
export function observedPosition(samples:PositionSample[],at:number):PositionSample|null{
 if(!Number.isFinite(at)||!samples.length||at<samples[0].at||at>samples[samples.length-1].at)return null;
 let lo=0,hi=samples.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(samples[mid].at<=at)lo=mid;else hi=mid-1;}return samples[lo];
}
