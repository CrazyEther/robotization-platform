import { z } from 'zod';

const identifier = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const safeUrl = z.string().url().refine(v => /^https?:\/\//.test(v), 'Только HTTP(S) ссылки');
export const sourceSchema = z.object({id:identifier,title:z.string().min(1).max(500),url:safeUrl,publisher:z.string().min(1).max(300),observedAt:z.string().datetime({offset:true}),publishedAt:z.string().nullable(),rawLocator:z.string().nullable(),sha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),terms:z.object({status:z.enum(['reference_only','permitted','unknown']),note:z.string().min(1)}),retrievalStatus:z.enum(['retrieved','unavailable'])});
export const characteristicSchema = z.object({key:identifier,label:z.string().min(1),value:z.union([z.number().finite(),z.string().max(1000)]),unit:z.string().nullable(),sourceId:identifier,status:z.enum(['vendor_claim','operator_reported','verified_primary']),conditions:z.string()});
export const productSchema = z.object({id:identifier,name:z.string().min(1).max(300),vendor:z.string().min(1).max(300),familyId:identifier,kind:z.enum(['component','machine','system','software']),summary:z.string().max(3000),sourceIds:z.array(identifier).min(1),characteristics:z.array(characteristicSchema),readiness:z.object({catalog:z.boolean(),comparison:z.boolean(),economics:z.boolean(),simulation:z.boolean(),procurement:z.boolean()}),limitations:z.array(z.string())});
export const caseSchema = z.object({id:identifier,company:z.string(),title:z.string(),summary:z.string(),sourceIds:z.array(identifier).min(1),status:z.enum(['vendor_claim','operator_reported']),familyIds:z.array(identifier)});
export const catalogSchema = z.object({sources:z.array(sourceSchema),products:z.array(productSchema),cases:z.array(caseSchema)});
export type Product=z.infer<typeof productSchema>;
export type Source=z.infer<typeof sourceSchema>;
export type Catalog=z.infer<typeof catalogSchema>;

import taxonomy from '../../data/process-templates.json';
export const {goals,objectTypes,families}=taxonomy;

export const diagnosticSchema=z.object({objectType:z.enum(['warehouse','airport','hospital','production','building','office','custom']),familyId:z.string(),goal:z.string().refine(v=>goals.some(g=>g.id===v),'Неизвестная бизнес-цель'),dataState:z.enum(['unknown','partial','measured']),description:z.string().max(4000)});
export function diagnose(raw:unknown){
 const parsed=diagnosticSchema.safeParse(raw); if(!parsed.success) return {status:'invalid',errors:parsed.error.issues.map(x=>x.message)};
 const x=parsed.data; const family=families.find(f=>f.id===x.familyId);
 if(!family) return {status:'invalid',errors:['Неизвестный процесс']};
 const compatible=x.objectType==='custom'||(family.objects as readonly string[]).includes(x.objectType);
 return {status:'complete',familyId:family.id,compatible,model:family.model,evidence:x.dataState,conclusion:!compatible?'Требуется отдельно подтвердить применимость процесса к объекту.':x.dataState==='measured'?'Можно проверять совместимость решений на предоставленных измерениях.':'Сначала зафиксируйте исходное состояние процесса. Подбор пока предварительный.',required:family.inputs,constraint:family.constraint,alternatives:[{kind:'manual',label:family.baseline},{kind:'digital',label:'Оцифровка и контроль исполнения'},{kind:'automation',label:'Механизация или роботизация после проверки ограничений'}],ruleVersion:'diagnostic-1.0.0'};
}

const conversions:Record<string,{unit:string;factor:number}>={kg:{unit:'kg',factor:1},g:{unit:'kg',factor:.001},t:{unit:'kg',factor:1000},mm:{unit:'mm',factor:1},cm:{unit:'mm',factor:10},m:{unit:'mm',factor:1000},'m/s':{unit:'m/s',factor:1},'km/h':{unit:'m/s',factor:1/3.6},'m2/h':{unit:'m2/h',factor:1}};
export function compareProducts(products:Product[]){
 const keys=[...new Set(products.flatMap(p=>p.characteristics.map(c=>c.key)))];
 return keys.map(key=>{const cells=products.map(p=>{const c=p.characteristics.find(c=>c.key===key);if(!c)return null; const conversion=c.unit?conversions[c.unit]:undefined;return {...c,rawValue:c.value,rawUnit:c.unit,value:typeof c.value==='number'&&conversion?c.value*conversion.factor:c.value,unit:conversion?.unit??c.unit};});const known=cells.filter(c=>c!==null);return {key,label:known[0]?.label??key,comparable:known.length===products.length&&new Set(known.map(c=>c.unit)).size===1&&new Set(products.map(p=>p.familyId)).size===1,cells};});
}
