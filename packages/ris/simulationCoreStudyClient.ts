import {z} from 'zod';
import {eventTraceSchema} from '../simulation-core/trace';
import {anyLogicFinanceSchema,type AnyLogicFinance,type AnyLogicSite} from './anylogic';
import type {SimulationCoreStudy} from './simulationCoreStudy';

const finite=z.number().finite();
export const studySampleSummarySchema=z.object({
 samples:z.number().int().min(0).max(30),
 mean:finite.nullable(),stddev:finite.nullable(),low95:finite.nullable(),high95:finite.nullable(),
 min:finite.nullable(),max:finite.nullable(),p5:finite.nullable(),p50:finite.nullable(),p95:finite.nullable(),
}).strict();
const summary=studySampleSummarySchema;
export const studyMetricSummariesSchema=z.object({
 created:summary,completed:summary,backlog:summary,throughputPerHour:summary,
 meanQueueSeconds:summary,p95CycleSeconds:summary,
 transportDistanceMeters:summary,transportEnergyKwh:summary,transportWaitSeconds:summary,
 meanTransportWaitSeconds:summary,trafficWaitSeconds:summary,robotUtilization:summary,minRobotSoc:summary,
 chargeCount:summary,chargingSeconds:summary,chargerWaitSeconds:summary,chargedEnergyKwh:summary,
}).strict();

const runMetricsSchema=z.object({
 created:z.number().int().min(0),completed:z.number().int().min(0),backlog:z.number().int().min(0),
 throughputPerHour:finite.min(0),meanQueueSeconds:finite.nullable(),p95CycleSeconds:finite.nullable(),
 resourceUtilization:z.record(z.string(),finite.min(0).max(1)),
 resourceAvailability:z.record(z.string(),finite.min(0).max(1)),
 downtimeSeconds:z.record(z.string(),finite.min(0)),
 transportDistanceMeters:finite.min(0),transportEnergyKwh:finite.min(0),transportWaitSeconds:finite.min(0),
 meanTransportWaitSeconds:finite.min(0),trafficWaitSeconds:finite.min(0),robotUtilization:finite.min(0).max(1),
 minRobotSoc:finite.min(0).max(1),chargeCount:z.number().int().min(0),chargingSeconds:finite.min(0),
 chargerWaitSeconds:finite.min(0),chargedEnergyKwh:finite.min(0),
}).strict();
const resourceSummarySchema=z.object({
 utilization:summary,availability:summary,downtimeSeconds:summary,
}).strict();
const experimentViewSchema=z.object({
 seeds:z.array(z.number().int().min(1).max(2147483647)).min(1).max(30),
 metrics:studyMetricSummariesSchema,
 resources:z.record(z.string(),resourceSummarySchema),
}).strict();

export const simulationCoreStudyDtoSchema=z.object({
 schemaVersion:z.literal('ris-simulation-study/1'),
 engine:z.object({name:z.literal('ris-simulation-study'),version:z.literal('1')}).strict(),
 scenarioHash:z.string().regex(/^fnv1a64:[0-9a-f]{16}$/),
 robotId:z.string().min(1).max(128),robotCount:z.number().int().min(1).max(10000),
 replications:z.number().int().min(1).max(30),
 robot:z.object({
  scenarioHash:z.string().regex(/^fnv1a64:[0-9a-f]{16}$/),
  run:z.object({
   engine:z.object({name:z.literal('simcore-process'),version:z.literal('4')}).strict(),
   metrics:runMetricsSchema,trace:eventTraceSchema,warnings:z.array(z.string()),
  }).strict(),
  experiment:experimentViewSchema,
 }).strict(),
 baseline:z.object({
  scenarioHash:z.string().regex(/^fnv1a64:[0-9a-f]{16}$/),
  config:z.object({workers:z.number().int().min(1),speedMps:finite.positive(),serviceSeconds:finite.min(0)}).strict(),
  runMetrics:runMetricsSchema,
  experiment:experimentViewSchema,
 }).strict(),
 warnings:z.array(z.string()),
}).strict().superRefine((value,ctx)=>{
 if(value.robot.experiment.seeds.length!==value.replications||value.baseline.experiment.seeds.length!==value.replications)
  ctx.addIssue({code:'custom',message:'Study replication and seed counts differ'});
 if(value.robot.run.trace.scenarioHash!==value.robot.scenarioHash)
  ctx.addIssue({code:'custom',message:'Representative trace scenario hash differs from robot scenario'});
});
export type SimulationCoreStudyDto=z.infer<typeof simulationCoreStudyDtoSchema>;

const experimentView=(experiment:SimulationCoreStudy['robot']['experiment'])=>({
 seeds:experiment.seeds,metrics:experiment.metrics,resources:experiment.resources,
});

export function toSimulationCoreStudyDto(study:SimulationCoreStudy):SimulationCoreStudyDto{
 return simulationCoreStudyDtoSchema.parse({
  schemaVersion:'ris-simulation-study/1',engine:study.engine,
  scenarioHash:study.scenarioHash,robotId:study.robotId,robotCount:study.robotCount,replications:study.replications,
  robot:{
   scenarioHash:study.robot.scenarioHash,
   run:{engine:study.robot.run.engine,metrics:study.robot.run.metrics,trace:study.robot.run.trace,warnings:study.robot.run.warnings},
   experiment:experimentView(study.robot.experiment),
  },
  baseline:{
   scenarioHash:study.baseline.scenarioHash,config:study.baseline.config,
   runMetrics:study.baseline.run.metrics,experiment:experimentView(study.baseline.experiment),
  },
  warnings:study.warnings,
 });
}

export type SimulationCoreAssessment={
 capex:number;annualOpex:number;annualBenefit:number;tco:number;
 robotAnnualCompletedConservative:number;baselineAnnualCompletedConservative:number;
 comparable:boolean;roiPercent:number|null;npv:number|null;paybackYears:number|null;
 warnings:string[];
};

const conservativeCompleted=(experiment:SimulationCoreStudyDto['robot']['experiment'])=>
 experiment.metrics.completed.low95??experiment.metrics.completed.mean??0;

export function assessSimulationCoreStudyDto(
 study:SimulationCoreStudyDto,
 rawFinance:AnyLogicFinance,
 site:Pick<AnyLogicSite,'siteSpecific'|'dimensionsConfirmed'|'geometryStatus'>,
):SimulationCoreAssessment{
 const finance=anyLogicFinanceSchema.parse(rawFinance);
 const robotAnnualCompletedConservative=conservativeCompleted(study.robot.experiment)*finance.workdays;
 const baselineAnnualCompletedConservative=conservativeCompleted(study.baseline.experiment)*finance.workdays;
 const energyKwh=study.robot.experiment.metrics.transportEnergyKwh.mean??0;
 const capex=finance.robotUnitPrice*study.robotCount+finance.integration+finance.infrastructure;
 const annualOpex=finance.maintenancePerRobotYear*study.robotCount+
  energyKwh*finance.workdays*finance.electricityPerKwh+finance.residualHumanAnnualCost;
 const annualBenefit=finance.baselineAnnualCost-annualOpex;
 const tco=capex+annualOpex*finance.horizonYears;
 const siteReady=site.siteSpecific&&site.dimensionsConfirmed&&
  (site.geometryStatus==='validated'||site.geometryStatus==='traced');
 const statisticalEvidence=study.replications>=5;
 const capacityReady=robotAnnualCompletedConservative>=finance.annualRequiredJobs&&
  baselineAnnualCompletedConservative>=finance.annualRequiredJobs;
 const financialInputsReady=capex>0&&finance.baselineAnnualCost>0&&
  finance.baselineAnnualCost>=finance.residualHumanAnnualCost&&finance.annualRequiredJobs>0;
 const comparable=siteReady&&statisticalEvidence&&capacityReady&&financialInputsReady;
 const rate=finance.discountRatePercent/100;
 const npv=-capex+Array.from({length:finance.horizonYears},(_,index)=>
  annualBenefit/Math.pow(1+rate,index+1)).reduce((sum,value)=>sum+value,0);
 const warnings=[
  ...study.warnings,
  ...(!siteReady?['ROI/NPV заблокированы: геометрия конкретного объекта не подтверждена.']:[]),
  ...(!statisticalEvidence?['ROI/NPV заблокированы: требуется минимум 5 независимых прогонов.']:[]),
  ...(statisticalEvidence&&!capacityReady?['ROI/NPV заблокированы: нижняя 95% граница производительности baseline или роботизированного процесса не закрывает годовой план.']:[]),
  ...(!financialInputsReady?['ROI/NPV заблокированы: финансовые входы неполны или несопоставимы.']:[]),
 ];
 return {
  capex,annualOpex,annualBenefit,tco,robotAnnualCompletedConservative,baselineAnnualCompletedConservative,
  comparable,roiPercent:comparable?(annualBenefit*finance.horizonYears-capex)/capex*100:null,
  npv:comparable?npv:null,paybackYears:comparable&&annualBenefit>0?capex/annualBenefit:null,warnings,
 };
}
