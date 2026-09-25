import {gridRoute,simulationSchema,type Sector,type SimulationInput} from './contracts';

export const processPresets:Record<Sector,{task:string;pickup:string;dropoff:string;loadSeconds:number;unloadSeconds:number}>={
 warehouse:{task:'Доставка паллет от приёмки к хранению',pickup:'Приёмка',dropoff:'Зона хранения',loadSeconds:35,unloadSeconds:35},
 factory:{task:'Межоперационная доставка деталей',pickup:'Склад компонентов',dropoff:'Рабочий центр',loadSeconds:30,unloadSeconds:30},
 hospital:{task:'Доставка медикаментов в отделение',pickup:'Аптечный склад',dropoff:'Пост отделения',loadSeconds:25,unloadSeconds:25},
 airport:{task:'Перемещение багажа к зоне выдачи',pickup:'Сортировка',dropoff:'Выдача',loadSeconds:20,unloadSeconds:20}
};

export type TwinRobotState='idle'|'loading'|'loaded'|'unloading'|'returning'|'charging'|'waiting_charge';
export type TwinRobotFrame={id:string;x:number;y:number;state:TwinRobotState;batteryPercent:number;taskId:number|null};
export type TwinFrame={t:number;robots:TwinRobotFrame[];backlog:number;completed:number};
export type TwinTimelinePoint={t:number;created:number;completed:number;backlog:number;busyRobots:number;chargingRobots:number};
export type TwinRobotSummary={id:string;distanceMeters:number;loadedMeters:number;emptyMeters:number;busySeconds:number;trafficWaitSeconds:number;chargingSeconds:number};
export type TwinResult={
 engine:'RIS Digital Twin'|'RIS Baseline Twin';engineVersion:'grid-agv/1.0';
 created:number;completed:number;backlog:number;throughputPerHour:number;meanQueueMinutes:number;
 meanJobSeconds:number|null;p95JobSeconds:number|null;robotUtilization:number;chargerUtilization:number;
 energyKwh:number;loadedMeters:number;emptyMeters:number;trafficWaitSeconds:number;
 frames:TwinFrame[];timeline:TwinTimelinePoint[];robots:TwinRobotSummary[];warnings:string[];
};
export type TwinRunInput={scenario:SimulationInput;robotId:string;frameStepSeconds?:number};
export type BaselineInput={scenario:SimulationInput;workers:number;speedMps:number;serviceSeconds:number;frameStepSeconds?:number};
type Job={id:number;created:number;started?:number;completed?:number};
type RuntimeRobot={
 id:string;pathIndex:number;state:TwinRobotState;task:Job|null;timer:number;moveCredit:number;
 batteryWh:number;chargingSeconds:number;busySeconds:number;trafficWaitSeconds:number;
 loadedMeters:number;emptyMeters:number;distanceMeters:number;
};
type EngineConfig={count:number;speedMps:number;loadSeconds:number;unloadSeconds:number;batteryWh:number;chargeW:number;whPerMeter:number;chargerCount:number;baseline:boolean;frameStepSeconds:number};

function rng(seed:number){let state=seed>>>0;return()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};}
function arrivals(s:SimulationInput){
 const end=s.workload.shiftHours*3600,rate=s.workload.demandPerHour/3600,out:number[]=[];
 if(s.mode==='fixed'){
  const interval=1/rate;
  for(let t=0;t<end-1e-9;t+=interval)out.push(t);
 }else{
  const random=rng(s.seed);let t=0;
  while(t<end){t+=-Math.log(Math.max(1e-12,1-random()))/rate;if(t<end)out.push(t);}
 }
 return out;
}
const percentile=(values:number[],p:number)=>{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(p*s.length)-1))];};
function stagingCells(scenario:SimulationInput,anchor:{x:number;y:number},count:number,routePoints:{x:number;y:number}[]){
 const blocked=(x:number,y:number)=>scenario.layout.obstacles.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);
 const route=new Set(routePoints.map(p=>p.x+','+p.y)),items:{x:number;y:number}[]=[];
 for(let radius=1;radius<=Math.max(scenario.layout.width,scenario.layout.height)&&items.length<count;radius++){
  for(let dy=-radius;dy<=radius&&items.length<count;dy++)for(let dx=-radius;dx<=radius&&items.length<count;dx++){
   if(Math.abs(dx)+Math.abs(dy)!==radius)continue;
   const x=anchor.x+dx,y=anchor.y+dy;if(x<0||y<0||x>=scenario.layout.width||y>=scenario.layout.height||blocked(x,y)||route.has(x+','+y))continue;
   items.push({x:x+.5,y:y+.5});
  }
 }
 return items;
}

function simulate(scenario:SimulationInput,config:EngineConfig,engine:TwinResult['engine']):TwinResult{
 const route=gridRoute(scenario.layout);
 if(!route)throw new Error('Между зонами процесса нет проходимого маршрута.');
 const path=route.points,shiftSeconds=Math.max(1,Math.round(scenario.workload.shiftHours*3600));
 const allArrivals=arrivals(scenario),queue:Job[]=[],jobs:Job[]=[],done:Job[]=[];
 let arrivalIndex=0,nextId=1,chargingNow=0;
 const robots:RuntimeRobot[]=Array.from({length:config.count},(_,i)=>({id:(config.baseline?'H':'R')+(i+1),pathIndex:0,state:'idle',task:null,timer:0,moveCredit:0,batteryWh:config.batteryWh,chargingSeconds:0,busySeconds:0,trafficWaitSeconds:0,loadedMeters:0,emptyMeters:0,distanceMeters:0}));
 const frames:TwinFrame[]=[],timeline:TwinTimelinePoint[]=[];
 const warnings:string[]=[];
 if(!config.baseline&&scenario.workload.loadKg>scenario.robot.payloadKg)warnings.push('Масса задания превышает заданную грузоподъёмность робота: задания не назначались.');
 const canServe=config.baseline||scenario.workload.loadKg<=scenario.robot.payloadKg;
 const fullBattery=config.batteryWh,chargeThreshold=Math.max(config.whPerMeter*route.distance*2.4,fullBattery*.2);
 const frameEvery=Math.max(1,Math.round(config.frameStepSeconds)),lastPath=path.length-1;
 const pickupSlots=stagingCells(scenario,path[0],robots.length,path),dropoffSlots=stagingCells(scenario,path[lastPath],robots.length,path);
 const displayPosition=(robot:RuntimeRobot,index:number)=>{
  if(['idle','charging','waiting_charge'].includes(robot.state))return pickupSlots[index]??{x:path[0].x+.5+(index+1)*.12,y:path[0].y+.5};
  if(robot.state==='returning'&&robot.pathIndex===lastPath)return dropoffSlots[index]??{x:path[lastPath].x+.5+(index+1)*.12,y:path[lastPath].y+.5};
  return {x:path[robot.pathIndex].x+.5,y:path[robot.pathIndex].y+.5};
 };
 const snapshot=(t:number)=>{
  if(t%frameEvery===0||t===shiftSeconds-1)frames.push({t,robots:robots.map((r,index)=>{const pos=displayPosition(r,index);return{id:r.id,x:pos.x,y:pos.y,state:r.state,batteryPercent:fullBattery>0?Math.max(0,Math.min(100,r.batteryWh/fullBattery*100)):100,taskId:r.task?.id??null};}),backlog:queue.length,completed:done.length});
  if(t%60===0||t===shiftSeconds-1)timeline.push({t,created:jobs.length,completed:done.length,backlog:queue.length,busyRobots:robots.filter(r=>!['idle','charging','waiting_charge'].includes(r.state)).length,chargingRobots:robots.filter(r=>r.state==='charging').length});
 };
 for(let t=0;t<shiftSeconds;t++){
  while(arrivalIndex<allArrivals.length&&allArrivals[arrivalIndex]<=t){
   const job={id:nextId++,created:allArrivals[arrivalIndex++]};jobs.push(job);queue.push(job);
  }
  for(const robot of robots){
   if(robot.state==='charging'){
    robot.chargingSeconds++;robot.batteryWh=Math.min(fullBattery,robot.batteryWh+config.chargeW/3600);
    if(robot.batteryWh>=fullBattery*.85){robot.state='idle';chargingNow=Math.max(0,chargingNow-1);}
    continue;
   }
   if(robot.state==='waiting_charge'){
    if(chargingNow<config.chargerCount){chargingNow++;robot.state='charging';}
    continue;
   }
   const pickupBusy=robots.some(r=>r!==robot&&(r.state==='loading'||(r.state==='loaded'&&r.pathIndex===0)));
   if(robot.state==='idle'&&robot.pathIndex===0&&canServe&&queue.length&&!pickupBusy){
    if(!config.baseline&&robot.batteryWh<chargeThreshold){robot.state=chargingNow<config.chargerCount?'charging':'waiting_charge';if(robot.state==='charging')chargingNow++;continue;}
    const job=queue.shift()!;job.started=t;robot.task=job;robot.state='loading';robot.timer=config.loadSeconds;
   }
   if(robot.state==='loading'||robot.state==='unloading'){
    robot.busySeconds++;robot.timer=Math.max(0,robot.timer-1);
    if(robot.timer<=0){
     if(robot.state==='loading')robot.state='loaded';
     else{const job=robot.task;if(job){job.completed=t;done.push(job);}robot.task=null;robot.state='returning';}
    }
   }
  }
  const movers=robots.filter(r=>r.state==='loaded'||r.state==='returning');
  for(const r of movers){r.busySeconds++;r.moveCredit+=config.speedMps;}
  const occupied=new Map<number,RuntimeRobot>();
  for(const r of movers)if(r.pathIndex>0&&r.pathIndex<lastPath)occupied.set(r.pathIndex,r);
  const hasLoadedInside=()=>robots.some(r=>r.state==='loaded'&&r.pathIndex>0&&r.pathIndex<lastPath);
  const hasReturningInside=()=>robots.some(r=>r.state==='returning'&&r.pathIndex>0&&r.pathIndex<lastPath);
  const ordered=[...movers.filter(r=>r.state==='loaded').sort((a,b)=>b.pathIndex-a.pathIndex),...movers.filter(r=>r.state==='returning').sort((a,b)=>a.pathIndex-b.pathIndex)];
  for(const r of ordered){
   if(r.moveCredit<1)continue;
   if(r.state==='loaded'&&r.pathIndex===0&&hasReturningInside()){r.trafficWaitSeconds++;continue;}
   if(r.state==='returning'&&r.pathIndex===lastPath&&hasLoadedInside()){r.trafficWaitSeconds++;continue;}
   const target=r.state==='loaded'?Math.min(lastPath,r.pathIndex+1):Math.max(0,r.pathIndex-1);
   if(target===r.pathIndex)continue;
   if(r.state==='loaded'&&target===lastPath&&robots.some(x=>x.state==='unloading')){r.trafficWaitSeconds++;continue;}
   if(target>0&&target<lastPath&&occupied.has(target)){r.trafficWaitSeconds++;continue;}
   if(r.pathIndex>0&&r.pathIndex<lastPath)occupied.delete(r.pathIndex);
   r.pathIndex=target;r.moveCredit-=1;r.distanceMeters++;if(r.state==='loaded')r.loadedMeters++;else r.emptyMeters++;
   if(target>0&&target<lastPath)occupied.set(target,r);
   if(!config.baseline)r.batteryWh=Math.max(0,r.batteryWh-config.whPerMeter);
   if(r.state==='loaded'&&r.pathIndex===lastPath){r.state='unloading';r.timer=config.unloadSeconds;}
   else if(r.state==='returning'&&r.pathIndex===0){r.state='idle';}
  }
  snapshot(t);
 }
 const jobSeconds=done.filter(j=>j.completed!==undefined).map(j=>(j.completed as number)-j.created);
 const queueMinutes=done.filter(j=>j.started!==undefined).map(j=>(j.started as number)-j.created);
 const totalBusy=robots.reduce((s,r)=>s+r.busySeconds,0),totalCharging=robots.reduce((s,r)=>s+r.chargingSeconds,0);
 const loadedMeters=robots.reduce((s,r)=>s+r.loadedMeters,0),emptyMeters=robots.reduce((s,r)=>s+r.emptyMeters,0);
 const energyKwh=config.baseline?0:(loadedMeters+emptyMeters)*config.whPerMeter/1000;
 if(queue.length)warnings.push('К концу смены осталось '+queue.length+' невыполненных заданий.');
 if(robots.some(r=>r.trafficWaitSeconds>0))warnings.push('Зафиксировано ожидание из-за занятых ячеек маршрута.');
 return {engine,engineVersion:'grid-agv/1.0',created:jobs.length,completed:done.length,backlog:queue.length,throughputPerHour:done.length/scenario.workload.shiftHours,
  meanQueueMinutes:queueMinutes.length?queueMinutes.reduce((a,b)=>a+b,0)/queueMinutes.length/60:0,
  meanJobSeconds:jobSeconds.length?jobSeconds.reduce((a,b)=>a+b,0)/jobSeconds.length:null,p95JobSeconds:percentile(jobSeconds,.95),
  robotUtilization:totalBusy/(shiftSeconds*robots.length),chargerUtilization:config.baseline?0:totalCharging/(shiftSeconds*Math.max(1,config.chargerCount)),
  energyKwh,loadedMeters,emptyMeters,trafficWaitSeconds:robots.reduce((s,r)=>s+r.trafficWaitSeconds,0),frames,timeline,
  robots:robots.map(r=>({id:r.id,distanceMeters:r.distanceMeters,loadedMeters:r.loadedMeters,emptyMeters:r.emptyMeters,busySeconds:r.busySeconds,trafficWaitSeconds:r.trafficWaitSeconds,chargingSeconds:r.chargingSeconds})),warnings};
}
export function runDigitalTwin({scenario,robotId:_robotId,frameStepSeconds=3}:TwinRunInput):TwinResult{
 const valid=simulationSchema.parse(scenario);
 return simulate(valid,{count:valid.robot.count,speedMps:valid.robot.speedMps,loadSeconds:valid.robot.loadSeconds,unloadSeconds:valid.robot.unloadSeconds,batteryWh:valid.robot.batteryWh,chargeW:valid.robot.chargeW,whPerMeter:valid.robot.whPerMeter,chargerCount:valid.robot.chargerCount,baseline:false,frameStepSeconds},'RIS Digital Twin');
}
export function runBaseline({scenario,workers,speedMps,serviceSeconds,frameStepSeconds=5}:BaselineInput):TwinResult{
 const valid=simulationSchema.parse(scenario);
 if(!Number.isInteger(workers)||workers<1||workers>100||!Number.isFinite(speedMps)||speedMps<=0||!Number.isFinite(serviceSeconds)||serviceSeconds<0)throw new Error('Некорректные параметры исходного процесса.');
 return simulate(valid,{count:workers,speedMps,loadSeconds:serviceSeconds/2,unloadSeconds:serviceSeconds/2,batteryWh:1e12,chargeW:0,whPerMeter:0,chargerCount:1,baseline:true,frameStepSeconds},'RIS Baseline Twin');
}
export type TwinFinance={robotUnitPrice:number;integration:number;infrastructure:number;maintenancePerRobotYear:number;electricityPerKwh:number;baselineAnnualCost:number;residualHumanAnnualCost:number;workdays:number;horizonYears:number;discountRatePercent:number;annualRequiredJobs:number};
export function compareDigitalTwin({scenario,baseline,robot,finance}:{scenario:SimulationInput;baseline:TwinResult;robot:TwinResult;finance:TwinFinance}){
 const capex=finance.robotUnitPrice*scenario.robot.count+finance.integration+finance.infrastructure;
 const baselineAnnualCompleted=baseline.completed*finance.workdays,robotAnnualCompleted=robot.completed*finance.workdays;
 const annualOpex=finance.maintenancePerRobotYear*scenario.robot.count+robot.energyKwh*finance.workdays*finance.electricityPerKwh+finance.residualHumanAnnualCost;
 const annualBenefit=finance.baselineAnnualCost-annualOpex,comparable=capex>0&&finance.baselineAnnualCost>0&&finance.baselineAnnualCost>=finance.residualHumanAnnualCost&&baselineAnnualCompleted>=finance.annualRequiredJobs&&robotAnnualCompleted>=finance.annualRequiredJobs;
 const rate=finance.discountRatePercent/100,npv=-capex+Array.from({length:finance.horizonYears},(_,i)=>annualBenefit/Math.pow(1+rate,i+1)).reduce((a,b)=>a+b,0);
 return {capex,annualOpex,annualBenefit,tco:capex+annualOpex*finance.horizonYears,baselineAnnualCompleted,robotAnnualCompleted,comparable,
  roiPercent:comparable?(annualBenefit*finance.horizonYears-capex)/capex*100:null,npv:comparable?npv:null,paybackYears:comparable&&annualBenefit>0?capex/annualBenefit:null,
  warnings:comparable?[]:['ROI/NPV заблокированы: исходный и роботизированный сценарии должны выполнять одинаковый годовой план, а денежные входы должны быть заполнены.']};
}
