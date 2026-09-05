import { z } from 'zod';
import { productSchema, sourceSchema } from '../catalog/index';
export const importSchema=z.object({mappingVersion:z.literal('1'),sources:z.array(sourceSchema).min(1).max(500),products:z.array(productSchema).min(1).max(1000)});
export function validateImport(raw:unknown){
 const parsed=importSchema.safeParse(raw);
 if(!parsed.success)return {valid:false,errors:parsed.error.issues.map(e=>({path:e.path.join('.'),message:e.message})),data:null};
 const data=parsed.data;const errors:Array<{path:string;message:string}>=[];const sources=new Map(data.sources.map(s=>[s.id,s]));
 if(sources.size!==data.sources.length)errors.push({path:'sources',message:'Повторные идентификаторы источников'});
 if(new Set(data.products.map(p=>p.id)).size!==data.products.length)errors.push({path:'products',message:'Повторные идентификаторы продуктов'});
 data.sources.forEach((s,i)=>{if(s.terms.status!=='permitted'||s.retrievalStatus!=='retrieved'||!s.sha256||!s.rawLocator)errors.push({path:`sources.${i}`,message:'Для публикации нужны разрешённые условия, полученный raw, locator и SHA-256'});});
 data.products.forEach((p,i)=>{for(const ref of [...p.sourceIds,...p.characteristics.map(c=>c.sourceId)])if(!sources.has(ref))errors.push({path:`products.${i}.sourceIds`,message:`Источник ${ref} отсутствует`}); if(p.readiness.economics||p.readiness.simulation||p.readiness.procurement)errors.push({path:`products.${i}.readiness`,message:'Импорт не может сам подтвердить экономику, имитацию или закупочную пригодность'});});
 return {valid:errors.length===0,errors,data:errors.length?null:data};
}
