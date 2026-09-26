import {z} from 'zod';
import {simulationSchema,type Sector,type SimulationInput} from './contracts';

const finite=z.number().finite();
export const processPresets:Record<Sector,{task:string;pickup:string;dropoff:string}>={
 warehouse:{task:'Доставка паллет: приёмка → хранение/отгрузка',pickup:'Приёмка',dropoff:'Хранение/отгрузка'},
 factory:{task:'Межоперационная доставка: заготовка → рабочая станция',pickup:'Зона заготовок',dropoff:'Рабочая станция'},
 hospital:{task:'Доставка медикаментов и материалов: центральный склад → отделение',pickup:'Центральный склад',dropoff:'Отделение'},
 airport:{task:'Доставка багажа: сортировка → зона выдачи',pickup:'Сортировка',dropoff:'Выдача'}
};

export const anyLogicSceneObjectSchema=z.object({
 id:z.string().min(1).max(120),kind:z.enum(['wall','rack','door','charger','station','elevator']),
 x:finite.min(0).max(300),y:finite.min(0).max(300),w:finite.positive().max(300),h:finite.positive().max(300),
 blocking:z.boolean(),label:z.string().min(1).max(200),capacity:z.number().int().min(1).max(1000)
}).strict();
export type AnyLogicSceneObject=z.infer<typeof anyLogicSceneObjectSchema>;

const baselineSchema=z.object({workers:z.number().int().min(1).max(1000),speedMps:finite.positive().max(10),serviceSeconds:finite.min(0).max(86400)}).strict();
const anyLogicInputSchema=z.object({
 sector:z.enum(['warehouse','factory','hospital','airport']),scenario:simulationSchema,robotId:z.string().min(1).max(120),
 objects:z.array(anyLogicSceneObjectSchema).max(5000),baseline:baselineSchema,process:z.object({task:z.string(),pickup:z.string(),dropoff:z.string()}).strict()
}).strict().superRefine((value,ctx)=>{
 if(value.sector!==value.scenario.sector)ctx.addIssue({code:'custom',message:'Sector and scenario.sector differ'});
 for(const o of value.objects)if(o.x+o.w>value.scenario.layout.width||o.y+o.h>value.scenario.layout.height)ctx.addIssue({code:'custom',message:'Scene object outside room: '+o.id});
});
export type AnyLogicInput=z.infer<typeof anyLogicInputSchema>;
export type AnyLogicPackage={schemaVersion:'ris-anylogic-input/1';inputHash:string;input:AnyLogicInput;requiredOutputs:string[]};
export function buildAnyLogicPackage({scenario,robotId,objects,baseline}:{scenario:SimulationInput;robotId:string;objects:AnyLogicSceneObject[];baseline:z.infer<typeof baselineSchema>}):AnyLogicPackage{
 const input=anyLogicInputSchema.parse({sector:scenario.sector,scenario,robotId,objects,baseline,process:processPresets[scenario.sector]});
 return {schemaVersion:'ris-anylogic-input/1',inputHash:fingerprint(input),input,requiredOutputs:['inputHash','baseline.kpis','robot.kpis','robot.frames[]','engineVersion','modelVersion','runIds']};
}

const kpiSchema=z.object({
 created:z.number().int().min(0),completed:z.number().int().min(0),backlog:z.number().int().min(0),throughputPerHour:finite.min(0),
 meanQueueMinutes:finite.min(0),p95JobSeconds:finite.nullable().refine(v=>v===null||v>=0),resourceUtilization:finite.min(0).max(1),
 energyKwh:finite.min(0),loadedMeters:finite.min(0),emptyMeters:finite.min(0),trafficWaitSeconds:finite.min(0)
}).strict().superRefine((value,ctx)=>{
 if(value.completed>value.created)ctx.addIssue({code:'custom',message:'completed exceeds created'});
 if(value.backlog>value.created)ctx.addIssue({code:'custom',message:'backlog exceeds created'});
});
export type AnyLogicKpis=z.infer<typeof kpiSchema>;
const robotFrameSchema=z.object({id:z.string().min(1).max(100),x:finite.min(0).max(300),y:finite.min(0).max(300),state:z.string().min(1).max(80),batteryPercent:finite.min(0).max(100).optional(),taskId:z.string().max(120).nullable().optional()}).strict();
export const anyLogicFrameSchema=z.object({t:finite.min(0),robots:z.array(robotFrameSchema).max(1000),backlog:z.number().int().min(0),completed:z.number().int().min(0)}).strict();
const runSchema=z.object({runId:z.string().min(1).max(160),kpis:kpiSchema}).strict();
const robotRunSchema=runSchema.extend({frames:z.array(anyLogicFrameSchema).min(1).max(200000)}).strict();
export const anyLogicEvidenceSchema=z.object({
 schemaVersion:z.literal('ris-anylogic-evidence/1'),inputHash:z.string().regex(/^fnv1a64:[0-9a-f]{16}$/),engine:z.literal('AnyLogic'),engineVersion:z.string().min(1).max(80),
 modelName:z.string().min(1).max(200),modelVersion:z.string().min(1).max(80),runGroupId:z.string().min(1).max(160),source:z.enum(['desktop','online','cloud']),
 input:anyLogicInputSchema,baseline:runSchema,robot:robotRunSchema,warnings:z.array(z.string().max(500)).max(100)
}).strict().superRefine((value,ctx)=>{
 const {width,height}=value.input.scenario.layout;let previous=-1;let expectedIds:string[]|null=null;
 for(const frame of value.robot.frames){
  if(frame.t<previous)ctx.addIssue({code:'custom',message:'AnyLogic frames are not time ordered'});previous=frame.t;
  if(frame.t>value.input.scenario.workload.shiftHours*3600)ctx.addIssue({code:'custom',message:'AnyLogic frame exceeds shift duration'});
  if(frame.completed>value.robot.kpis.completed||frame.completed>value.robot.kpis.created)ctx.addIssue({code:'custom',message:'Frame completed exceeds final KPI'});
  if(frame.backlog>value.robot.kpis.created)ctx.addIssue({code:'custom',message:'Frame backlog exceeds created tasks'});
  if(frame.robots.length!==value.input.scenario.robot.count)ctx.addIssue({code:'custom',message:'Frame robot count differs from configured fleet'});
  const ids=new Set<string>();for(const robot of frame.robots){if(ids.has(robot.id))ctx.addIssue({code:'custom',message:'Duplicate robot id in frame'});ids.add(robot.id);if(robot.x>width||robot.y>height)ctx.addIssue({code:'custom',message:'Robot coordinate outside room'});}
  const sorted=[...ids].sort();if(expectedIds===null)expectedIds=sorted;else if(sorted.join('\0')!==expectedIds.join('\0'))ctx.addIssue({code:'custom',message:'Robot identities change between frames'});
 }
});
export type AnyLogicEvidence=z.infer<typeof anyLogicEvidenceSchema>;

const canonical=(value:unknown):string=>{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
};
const fingerprint=(value:unknown):string=>{
 const bytes=new TextEncoder().encode(canonical(value));let hash=0xcbf29ce484222325n;
 for(const byte of bytes){hash^=BigInt(byte);hash=BigInt.asUintN(64,hash*0x100000001b3n);}
 return 'fnv1a64:'+hash.toString(16).padStart(16,'0');
};
export function evidenceMatchesPackage(evidence:AnyLogicEvidence,pkg:AnyLogicPackage){return evidence.inputHash===pkg.inputHash&&canonical(evidence.input)===canonical(pkg.input);}
export const anyLogicFinanceSchema=z.object({
 robotUnitPrice:finite.min(0),integration:finite.min(0),infrastructure:finite.min(0),maintenancePerRobotYear:finite.min(0),
 electricityPerKwh:finite.min(0),baselineAnnualCost:finite.min(0),residualHumanAnnualCost:finite.min(0),
 workdays:z.number().int().min(1).max(366),horizonYears:z.number().int().min(1).max(30),discountRatePercent:finite.min(0).max(100),annualRequiredJobs:z.number().int().min(1)
}).strict();
export type AnyLogicFinance=z.infer<typeof anyLogicFinanceSchema>;

export function assessAnyLogicEvidence(raw:AnyLogicEvidence,rawFinance:AnyLogicFinance){
 const evidence=anyLogicEvidenceSchema.parse(raw),finance=anyLogicFinanceSchema.parse(rawFinance),count=evidence.input.scenario.robot.count;
 const capex=finance.robotUnitPrice*count+finance.integration+finance.infrastructure;
 const baselineAnnualCompleted=evidence.baseline.kpis.completed*finance.workdays;
 const robotAnnualCompleted=evidence.robot.kpis.completed*finance.workdays;
 const annualOpex=finance.maintenancePerRobotYear*count+evidence.robot.kpis.energyKwh*finance.workdays*finance.electricityPerKwh+finance.residualHumanAnnualCost;
 const annualBenefit=finance.baselineAnnualCost-annualOpex;
 const comparable=capex>0&&finance.baselineAnnualCost>0&&finance.baselineAnnualCost>=finance.residualHumanAnnualCost&&baselineAnnualCompleted>=finance.annualRequiredJobs&&robotAnnualCompleted>=finance.annualRequiredJobs;
 const rate=finance.discountRatePercent/100;
 const npv=-capex+Array.from({length:finance.horizonYears},(_,i)=>annualBenefit/Math.pow(1+rate,i+1)).reduce((a,b)=>a+b,0);
 return {capex,annualOpex,annualBenefit,tco:capex+annualOpex*finance.horizonYears,baselineAnnualCompleted,robotAnnualCompleted,comparable,
  roiPercent:comparable?(annualBenefit*finance.horizonYears-capex)/capex*100:null,npv:comparable?npv:null,paybackYears:comparable&&annualBenefit>0?capex/annualBenefit:null,
  warnings:comparable?[...evidence.warnings]:[...evidence.warnings,'ROI/NPV заблокированы: нужны подтверждённые результаты AnyLogic для обоих процессов, одинаковый годовой план и заполненные денежные входы.']};
}
