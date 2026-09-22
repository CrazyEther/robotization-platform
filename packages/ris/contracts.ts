import {z} from 'zod';
export const point=z.object({x:z.number().int().min(0).max(300),y:z.number().int().min(0).max(300)}).strict();
export const rect=z.object({x:z.number().int().min(0).max(300),y:z.number().int().min(0).max(300),w:z.number().int().min(1).max(300),h:z.number().int().min(1).max(300)}).strict();
export const layoutSchema=z.object({width:z.number().int().min(8).max(300),height:z.number().int().min(8).max(300),pickup:point,dropoff:point,obstacles:z.array(rect).max(30)}).strict();
export const simulationSchema=z.object({
 sector:z.enum(['warehouse','factory','hospital','airport']),layout:layoutSchema,
 workload:z.object({demandPerHour:z.number().positive().max(10000),loadKg:z.number().positive().max(20000),shiftHours:z.number().min(.25).max(24)}).strict(),
 robot:z.object({count:z.number().int().min(1).max(100),payloadKg:z.number().positive().max(20000),speedMps:z.number().min(.05).max(10),loadSeconds:z.number().min(0).max(3600),unloadSeconds:z.number().min(0).max(3600),batteryWh:z.number().min(10).max(200000),chargeW:z.number().min(1).max(100000),whPerMeter:z.number().min(.01).max(500),chargerCount:z.number().int().min(1).max(100)}).strict(),
 mode:z.enum(['fixed','poisson']).default('fixed'),seed:z.number().int().min(1).max(2147483647).default(42)}).strict();
export type SimulationInput=z.infer<typeof simulationSchema>;
export type Layout=z.infer<typeof layoutSchema>;
export type Sector=SimulationInput['sector'];
export type SimulationResult={engine:string;engineVersion:string;status:'complete';routeMeters:number;created:number;completed:number;backlog:number;throughputPerHour:number;meanQueueMinutes:number;robotUtilization:number;distanceMeters:number;energyKwh:number;chargingHours:number;warnings:string[];inputHash:string;wallTimeMs:number};
export const sectorTemplates:Record<Sector,{title:string;subtitle:string;operation:string;layout:Layout;demandPerHour:number;loadKg:number}>={
 warehouse:{title:'Склад и логистика',subtitle:'Приёмка → хранение → отгрузка',operation:'Перемещение грузовых единиц',layout:{width:55,height:34,pickup:{x:5,y:8},dropoff:{x:49,y:27},obstacles:[{x:17,y:3,w:5,h:20},{x:29,y:11,w:5,h:20},{x:39,y:3,w:4,h:17}]},demandPerHour:18,loadKg:160},
 factory:{title:'Производство',subtitle:'Зона заготовок → обрабатывающий участок',operation:'Межоперационная транспортировка',layout:{width:45,height:32,pickup:{x:5,y:6},dropoff:{x:39,y:25},obstacles:[{x:14,y:4,w:7,h:13},{x:25,y:14,w:9,h:13}]},demandPerHour:12,loadKg:90},
 hospital:{title:'Медицинское учреждение',subtitle:'Центральный склад → отделение (один этаж)',operation:'Доставка материалов',layout:{width:58,height:30,pickup:{x:5,y:5},dropoff:{x:52,y:24},obstacles:[{x:15,y:3,w:7,h:10},{x:27,y:16,w:7,h:11},{x:41,y:3,w:6,h:10}]},demandPerHour:10,loadKg:30},
 airport:{title:'Аэропорт',subtitle:'Зона сортировки → выдача (один уровень)',operation:'Доставка багажа',layout:{width:66,height:36,pickup:{x:7,y:8},dropoff:{x:59,y:29},obstacles:[{x:21,y:5,w:7,h:20},{x:39,y:11,w:7,h:20}]},demandPerHour:24,loadKg:65}
};
export function createScenario(sector:Sector):SimulationInput{const t=sectorTemplates[sector];return {sector,layout:structuredClone(t.layout),workload:{demandPerHour:t.demandPerHour,loadKg:t.loadKg,shiftHours:8},robot:{count:3,payloadKg:250,speedMps:.75,loadSeconds:40,unloadSeconds:40,batteryWh:2400,chargeW:1000,whPerMeter:.25,chargerCount:1},mode:'fixed',seed:42};}
export function gridRoute(layout:Layout):{distance:number;points:{x:number;y:number}[]}|null{const {width:w,height:h,pickup:a,dropoff:b}=layout;if([a,b].some(p=>p.x>=w||p.y>=h))return null;
 const blocked=(x:number,y:number)=>layout.obstacles.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);if(blocked(a.x,a.y)||blocked(b.x,b.y))return null;
 const key=(x:number,y:number)=>y*w+x,prev=new Int32Array(w*h).fill(-1),seen=new Uint8Array(w*h),start=key(a.x,a.y),end=key(b.x,b.y),q=[start];seen[start]=1;
 for(let head=0;head<q.length;head++){const p=q[head];if(p===end)break;const x=p%w,y=Math.floor(p/w);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h||blocked(nx,ny))continue;const v=key(nx,ny);if(seen[v])continue;seen[v]=1;prev[v]=p;q.push(v);}}if(!seen[end])return null;const points:{x:number;y:number}[]=[];for(let p=end;p!==-1;p=prev[p])points.push({x:p%w,y:Math.floor(p/w)});points.reverse();return {distance:points.length-1,points};}
export type FinanceInput={unitPrice:number;installation:number;infrastructure:number;chargersCost:number;maintenanceAnnual:number;electricityPerKwh:number;baselineCostAnnual:number;residualHumanCostAnnual:number;daysPerYear:number;horizonYears:number;discountRatePercent:number;annualDemand:number;baselineAnnualCompleted:number};
export type FinanceResult={capex:number;annualOpex:number;annualSaving:number;netAnnualBenefit:number;tco:number;roiPercent:number|null;npv:number|null;paybackYears:number|null;annualCompleted:number;comparable:boolean;warnings:string[]};
export function evaluateInvestment(s:SimulationInput,r:SimulationResult,f:FinanceInput):FinanceResult{
 const values=Object.values(f);if(values.some(v=>!Number.isFinite(v)||v<0)||f.horizonYears<1||f.horizonYears>30||f.daysPerYear>366||f.discountRatePercent>100)throw new Error('Недопустимые финансовые параметры.');
 const capex=f.unitPrice*s.robot.count+f.installation+f.infrastructure+f.chargersCost;
 const annualCompleted=r.completed*f.daysPerYear;
 const annualOpex=f.maintenanceAnnual+r.energyKwh*f.daysPerYear*f.electricityPerKwh;
 const comparable=annualCompleted>=f.annualDemand&&f.baselineAnnualCompleted>=f.annualDemand&&f.annualDemand>0&&f.baselineCostAnnual>=f.residualHumanCostAnnual&&f.baselineCostAnnual>0&&capex>0;
 const annualSaving=f.baselineCostAnnual-f.residualHumanCostAnnual;
 const netAnnualBenefit=annualSaving-annualOpex;
 const tco=capex+f.horizonYears*(annualOpex+f.residualHumanCostAnnual);
 const npv=-capex+Array.from({length:f.horizonYears},(_,i)=>netAnnualBenefit/Math.pow(1+f.discountRatePercent/100,i+1)).reduce((a,b)=>a+b,0);
 return {capex,annualOpex,annualSaving,netAnnualBenefit,tco,roiPercent:comparable?((netAnnualBenefit*f.horizonYears-capex)/capex)*100:null,npv:comparable?npv:null,paybackYears:comparable&&netAnnualBenefit>0?capex/netAnnualBenefit:null,annualCompleted,comparable,warnings:[...(!comparable?['Не подтверждена сопоставимость объёма работ и затрат: ROI/NPV не рассчитываются.']:[]),...(r.backlog>0?['Часть заявок не выполнена за смену.']:[])]};
}
