import {describe,expect,it,vi} from 'vitest';
import {createScenario} from '../packages/ris/contracts';
import {buildCloudRunRequest,parseCloudResults,validateCloudVersion,AnyLogicCloud,assessCloudInvestment} from '../packages/ris/cloud';

const s=createScenario('hospital');
const input={scenario:s,robotId:'mir-250'};
const fields=[
 {name:'risLayoutJson',type:'STRING',units:null,value:'{}'},
 {name:'risRobotId',type:'STRING',units:null,value:''},
 {name:'risSector',type:'STRING',units:null,value:''},
 {name:'risRobotCount',type:'INTEGER',units:null,value:'1'},
 {name:'risRobotSpeedMps',type:'DOUBLE',units:null,value:'1'},
 {name:'risDemandPerHour',type:'DOUBLE',units:null,value:'1'},
 {name:'risShiftHours',type:'DOUBLE',units:null,value:'1'},
 {name:'{STOP_TIME}',type:'DOUBLE',units:'SECOND',value:'1'},
 {name:'{RANDOM_SEED}',type:'LONG',units:null,value:'1'}
];
const outputs=['risTraceJson','risKpisJson'].map(name=>({name,type:'STRING',units:null,value:null}));
const version={id:'v-123',version:1,experimentTemplate:{inputs:fields,outputs}};
const goodKpis={completed:12,created:13,meanQueueMinutes:2,robotUtilization:.63,energyKwh:3,baselineCompleted:8,baselineAnnualCostRub:3000000};
const trace=[{t:0,robotId:'r1',x:5,y:5,state:'idle'},{t:5,robotId:'r1',x:6,y:5,state:'loaded'}];
const resultOutput=[
 {aggregationType:'IDENTITY',inputs:[],outputs:[{name:'risKpisJson'}],value:JSON.stringify(JSON.stringify(goodKpis))},
 {aggregationType:'IDENTITY',inputs:[],outputs:[{name:'risTraceJson'}],value:JSON.stringify(JSON.stringify(trace))}
];
describe('AnyLogic Cloud adapter: no results without model evidence',()=>{
 it('requires the exact RIS inputs and trajectory/metric outputs',()=>{
  expect(validateCloudVersion(version).id).toBe('v-123');
  expect(()=>validateCloudVersion({...version,experimentTemplate:{...version.experimentTemplate,outputs:[]}})).toThrow(/risTraceJson/);
 });
 it('maps real layout, sector and robot into the versioned Cloud run request',()=>{
  const req=buildCloudRunRequest(version,input);
  expect(req.experimentType).toBe('SIMULATION');
  const field=(name:string)=>req.inputs.find(x=>x.name===name)?.value;
  expect(JSON.parse(field('risLayoutJson')??'{}')).toEqual(s.layout);
  expect(field('risRobotId')).toBe('mir-250');
  expect(field('risSector')).toBe('hospital');
  expect(field('risRobotCount')).toBe(String(s.robot.count));
  expect(field('{STOP_TIME}')).toBe(String(s.workload.shiftHours*3600));
 });
 it('accepts actual Cloud output descriptors and rejects incomplete traces or fake KPIs',()=>{
  const result=parseCloudResults(resultOutput,input,'v-123','run-1');
  expect(result.engine).toBe('AnyLogic Cloud');
  expect(result.runId).toBe('run-1');
  expect(result.trajectory).toEqual(trace);
  expect(result.kpis.completed).toBe(12);
  expect(()=>parseCloudResults(resultOutput.slice(0,1),input,'v-123','run-1')).toThrow(/risTraceJson/);
  expect(()=>parseCloudResults([{...resultOutput[0],value:'{}'},resultOutput[1]],input,'v-123','run-1')).toThrow();
 });
 it('never leaks the AnyLogic API key and waits for a completed run',async()=>{
  const requests:Array<{url:string;auth:string|null;method:string}>=[];
  let poll=0;
  const transport=vi.fn(async(url:string,init?:RequestInit)=>{
   requests.push({url,auth:new Headers(init?.headers).get('Authorization'),method:init?.method??'GET'});
   if(url.endsWith('/models/model-1/versions/v-123'))return new Response(JSON.stringify(version),{status:200});
   if(url.endsWith('/versions/v-123/runs'))return new Response(JSON.stringify({id:'run-1',status:'RUNNING'}),{status:200});
   if(url.endsWith('/versions/v-123/run'))return new Response(JSON.stringify({id:'run-1',status:++poll===1?'RUNNING':'COMPLETED'}),{status:200});
   if(url.endsWith('/versions/v-123/results/run-1'))return new Response(JSON.stringify(resultOutput),{status:200});
   throw Error('Unknown endpoint '+url);
  });
  const api=new AnyLogicCloud({origin:'https://cloud.anylogic.com',apiKey:'top-secret-cloud-key',modelId:'model-1',versionId:'v-123'},transport);
  const result=await api.run(input);
  expect(result.kpis.completed).toBe(12);
  expect(requests.every(r=>r.auth==='top-secret-cloud-key')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('top-secret-cloud-key');
  expect(requests.some(x=>x.url.endsWith('/runs'))).toBe(true);
 });
 it('refuses to run without a configured model or with untrusted Cloud host',()=>{
  expect(()=>new AnyLogicCloud({origin:'http://169.254.169.254',apiKey:'a',modelId:'m',versionId:'v'})).toThrow();
  expect(()=>new AnyLogicCloud({origin:'https://cloud.anylogic.com',apiKey:'',modelId:'m',versionId:'v'})).toThrow();
 });
});


describe('AnyLogic Cloud scenario ROI: baseline and robot both measured by the same model',()=>{
 const base={unitPriceRub:2000000,installRub:100000,maintenanceRubPerRobotYear:90000,
  electricityRubPerKwh:9,baselineAnnualCostRub:2400000,residualHumanRubYear:300000,
  daysPerYear:250,annualRequiredJobs:2000,horizonYears:5,discountRatePercent:10,marginRubPerExtraJob:0};
 it('computes an evaluated alternative only after actual Cloud outputs and monetary inputs',()=>{
  const result=parseCloudResults(resultOutput,input,'v-123','run-1');
  const assessed=assessCloudInvestment(result,s,base);
  expect(assessed.capex).toBe(6100000);
  expect(assessed.annualOpex).toBe(300000+270000+6750);
  expect(assessed.baselineAnnualCompleted).toBe(8*250);
  expect(assessed.robotAnnualCompleted).toBe(12*250);
  expect(assessed.roiPercent).not.toBeNull();
 });
 it('blocks ROI for incomplete baseline and missed demand',()=>{
  const result=parseCloudResults(resultOutput,input,'v-123','run-1');
  expect(assessCloudInvestment(result,s,{...base,baselineAnnualCostRub:0}).roiPercent).toBeNull();
  expect(assessCloudInvestment(result,s,{...base,annualRequiredJobs:9000}).roiPercent).toBeNull();
 });
});
