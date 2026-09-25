import {z} from 'zod';
import {simulationSchema,type SimulationInput} from './contracts';

export const cloudRequestSchema=z.object({
 scenario:simulationSchema,
 robotId:z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/)
}).strict();
export type CloudRequest=z.infer<typeof cloudRequestSchema>;
const num=z.number().finite();
export const cloudKpisSchema=z.object({
 created:num.int().min(0),completed:num.int().min(0),
 meanQueueMinutes:num.min(0),robotUtilization:num.min(0).max(1),
 energyKwh:num.min(0),baselineCompleted:num.int().min(0),
 baselineAnnualCostRub:num.min(0)
}).strict();
export const cloudFrameSchema=z.object({
 t:num.min(0),robotId:z.string().min(1).max(80),
 x:num.min(0),y:num.min(0),state:z.string().min(1).max(60)
}).strict();
export const cloudResultSchema=z.object({
 engine:z.literal('AnyLogic Cloud'),versionId:z.string().min(1),
 runId:z.string().min(1),modelVersion:z.number().int().min(1),
 kpis:cloudKpisSchema,trajectory:z.array(cloudFrameSchema).min(1).max(50000),
 robotId:z.string().min(1),sector:z.enum(['warehouse','factory','hospital','airport'])
}).strict();
export type CloudResult=z.infer<typeof cloudResultSchema>;
export type CloudInput={name:string;type:string;units:string|null;value:string};
export type CloudVersion={id:string;version:number;experimentTemplate:{inputs:CloudInput[];outputs:Array<{name:string;type:string;units:string|null;value:string|null}>}};
export type CloudRunRequest={experimentType:'SIMULATION';inputs:CloudInput[]};
const requiredInputs=['risLayoutJson','risRobotId','risSector','risRobotCount','risRobotSpeedMps','risDemandPerHour','risShiftHours'];
const requiredOutputs=['risTraceJson','risKpisJson'];
const inputTypes:Record<string,string>={risLayoutJson:'STRING',risRobotId:'STRING',risSector:'STRING',risRobotCount:'INTEGER',risRobotSpeedMps:'DOUBLE',risDemandPerHour:'DOUBLE',risShiftHours:'DOUBLE'};
export function validateCloudVersion(raw:unknown):CloudVersion{
 const version=z.object({
  id:z.string().min(1),version:z.number().int().min(1),
  experimentTemplate:z.object({
   inputs:z.array(z.object({name:z.string(),type:z.string(),units:z.string().nullable(),value:z.string()})),
   outputs:z.array(z.object({name:z.string(),type:z.string(),units:z.string().nullable(),value:z.string().nullable()}))
  })
 }).parse(raw);
 for(const key of requiredInputs){
  const item=version.experimentTemplate.inputs.find(x=>x.name===key);
  if(!item||item.type!==inputTypes[key])throw Error('AnyLogic Cloud model missing compatible input: '+key);
 }
 for(const key of requiredOutputs){
  const item=version.experimentTemplate.outputs.find(x=>x.name===key);
  if(!item||item.type!=='STRING')throw Error('AnyLogic Cloud model missing compatible output: '+key);
 }
 return version;
}
export function buildCloudRunRequest(rawVersion:unknown,rawRequest:unknown):CloudRunRequest{
 const version=validateCloudVersion(rawVersion),{scenario,robotId}=cloudRequestSchema.parse(rawRequest);
 const replacements:Record<string,string>={
  risLayoutJson:JSON.stringify(scenario.layout),risRobotId:robotId,risSector:scenario.sector,
  risRobotCount:String(scenario.robot.count),risRobotSpeedMps:String(scenario.robot.speedMps),
  risDemandPerHour:String(scenario.workload.demandPerHour),risShiftHours:String(scenario.workload.shiftHours),
  '{STOP_TIME}':String(scenario.workload.shiftHours*3600),'{RANDOM_SEED}':String(scenario.seed)
 };
 return {experimentType:'SIMULATION',inputs:version.experimentTemplate.inputs.map(item=>({...item,value:replacements[item.name]??item.value}))};
}
function decodeJsonString(raw:unknown):unknown{
 if(typeof raw!=='string')throw Error('AnyLogic Cloud output value is not a JSON string');
 let parsed:unknown=JSON.parse(raw);
 if(typeof parsed==='string')parsed=JSON.parse(parsed);
 return parsed;
}
export function parseCloudResults(raw:unknown,request:CloudRequest,versionId:string,runId:string,modelVersion=1):CloudResult{
 const entries=z.array(z.object({aggregationType:z.literal('IDENTITY'),outputs:z.array(z.object({name:z.string()})),value:z.string()})).parse(raw);
 const get=(name:string)=>{const entry=entries.find(x=>x.outputs.some(y=>y.name===name));if(!entry)throw Error('AnyLogic Cloud result missing '+name);return decodeJsonString(entry.value);};
 const kpis=cloudKpisSchema.parse(get('risKpisJson'));
 const trajectory=z.array(cloudFrameSchema).min(1).max(50000).parse(get('risTraceJson'));
 if(kpis.completed>kpis.created)throw Error('AnyLogic Cloud completed jobs exceeds created');
 const {width,height}=request.scenario.layout;
 let previous=-1;
 for(const frame of trajectory){
  if(frame.x>=width||frame.y>=height||frame.t<previous||frame.t>request.scenario.workload.shiftHours*3600)throw Error('Cloud trajectory is outside the scenario dimensions or simulation time');
  previous=frame.t;
 }
 return cloudResultSchema.parse({engine:'AnyLogic Cloud',versionId,modelVersion,runId,kpis,trajectory,robotId:request.robotId,sector:request.scenario.sector});
}
export type CloudConfig={origin:string;apiKey:string;modelId:string;versionId:string};
type Transport=(url:string,init?:RequestInit)=>Promise<Response>;
export class AnyLogicCloud{
 private base:string;
 constructor(private config:CloudConfig,private transport:Transport=fetch){
  const url=new URL(config.origin);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!config.apiKey||!config.modelId||!config.versionId||!(/^[a-zA-Z0-9-]{1,128}$/.test(config.modelId)&&/^[a-zA-Z0-9-]{1,128}$/.test(config.versionId)))throw Error('AnyLogic Cloud credentials, HTTPS host, model or version missing');
  this.base=url.origin+'/api/open/8.5.0';
 }
 private async request(path:string,body?:unknown):Promise<unknown>{
  const response=await this.transport(this.base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:this.config.apiKey,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('AnyLogic Cloud HTTP '+response.status+' on '+path);
  return response.json();
 }
 async inspect():Promise<CloudVersion>{
  return validateCloudVersion(await this.request('/models/'+this.config.modelId+'/versions/'+this.config.versionId));
 }
 async run(input:CloudRequest):Promise<CloudResult>{
  const version=await this.inspect();
  if(version.id!==this.config.versionId)throw Error('Cloud version does not match the pinned model version');
  const body=buildCloudRunRequest(version,input),path='/versions/'+this.config.versionId;
  const started=z.object({id:z.string().min(1),status:z.string()}).parse(await this.request(path+'/runs',body));
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(started.id))throw Error('Invalid Cloud run ID');
  let status=started.status;
  for(let retry=0;status!=='COMPLETED'&&retry<30;retry++){
   if(['FAILED','ERROR','STOPPED','CANCELLED'].includes(status))throw Error('AnyLogic Cloud run failed: '+status);
   const next=z.object({id:z.string(),status:z.string()}).parse(await this.request(path+'/run',body));
   if(next.id!==started.id)throw Error('Cloud changed run ID during polling');
   status=next.status;
   if(status!=='COMPLETED')await new Promise(resolve=>setTimeout(resolve,300));
  }
  if(status!=='COMPLETED')throw Error('AnyLogic Cloud run still pending: no ROI available');
  const outputTemplate=JSON.stringify(requiredOutputs.map(name=>({aggregationType:'IDENTITY',inputs:[],outputs:[{name}]})));
  const results=await this.request(path+'/results/'+started.id,{experimentType:'SIMULATION',inputs:body.inputs,outputs:outputTemplate});
  return parseCloudResults(results,input,this.config.versionId,started.id,version.version);
 }
}


export const cloudFinanceSchema=z.object({
 unitPriceRub:num.min(0),installRub:num.min(0),maintenanceRubPerRobotYear:num.min(0),
 electricityRubPerKwh:num.min(0),baselineAnnualCostRub:num.min(0),residualHumanRubYear:num.min(0),
 daysPerYear:num.int().min(1).max(366),annualRequiredJobs:num.int().min(1),
 horizonYears:num.int().min(1).max(30),discountRatePercent:num.min(0).max(100),
 marginRubPerExtraJob:num.min(0)
}).strict();
export type CloudFinance=z.infer<typeof cloudFinanceSchema>;
export function assessCloudInvestment(result:CloudResult,scenario:SimulationInput,rawFinance:CloudFinance){
 const finance=cloudFinanceSchema.parse(rawFinance);
 const {robotUtilization,baselineCompleted,completed,energyKwh}=result.kpis;
 const count=scenario.robot.count,days=finance.daysPerYear;
 const capex=finance.unitPriceRub*count+finance.installRub;
 const baselineAnnualCompleted=baselineCompleted*days,robotAnnualCompleted=completed*days;
 const annualOpex=finance.maintenanceRubPerRobotYear*count+finance.electricityRubPerKwh*energyKwh*days+finance.residualHumanRubYear;
 const increasedJobs=Math.max(0,robotAnnualCompleted-baselineAnnualCompleted);
 const annualBenefit=finance.baselineAnnualCostRub-annualOpex+increasedJobs*finance.marginRubPerExtraJob;
 const comparable=baselineAnnualCompleted>=finance.annualRequiredJobs&&robotAnnualCompleted>=finance.annualRequiredJobs&&
  finance.baselineAnnualCostRub>0&&finance.unitPriceRub>0&&capex>0&&finance.baselineAnnualCostRub>=finance.residualHumanRubYear;
 const horizon=finance.horizonYears,rate=finance.discountRatePercent/100;
 const npv=-capex+Array.from({length:horizon},(_,i)=>annualBenefit/Math.pow(1+rate,i+1)).reduce((a,b)=>a+b,0);
 return {engine:result.engine,runId:result.runId,versionId:result.versionId,robotUtilization,
  capex,annualOpex,annualBenefit,tco:capex+annualOpex*horizon,
  baselineAnnualCompleted,robotAnnualCompleted,comparable,
  roiPercent:comparable?(annualBenefit*horizon-capex)/capex*100:null,
  npv:comparable?npv:null,
  paybackYears:comparable&&annualBenefit>0?capex/annualBenefit:null,
  warnings:comparable?[]:['ROI заблокирован: отсутствуют подтверждённые денежные входы или один из смоделированных процессов не выполняет общий годовой план.']
 };
}
