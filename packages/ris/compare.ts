import {z} from 'zod';
import {simulationSchema} from './contracts';
const money=z.number().finite().min(0).max(1e12);
export const compareFinanceSchema=z.object({
 baselineWorkers:z.number().int().min(1).max(100),
 baselineTaskSeconds:z.number().finite().gt(0).max(86400),
 baselineAnnualCostRub:money,residualHumanCostAnnualRub:money,
 robotUnitPriceRub:money,installationRub:money,infrastructureRub:money,chargersRub:money,
 annualMaintenanceRub:money,electricityRubPerKwh:z.number().finite().min(0).max(1e9),
 workdaysPerYear:z.number().int().min(1).max(366),
 horizonYears:z.number().int().min(1).max(30),
 discountRatePercent:z.number().finite().min(0).max(100),
 annualRequiredJobs:z.number().int().min(1).max(10000000),
 marginRubPerAdditionalJob:z.number().finite().min(0).max(1e9)
}).strict();
export const comparisonRequestSchema=z.object({
 scenario:simulationSchema,finance:compareFinanceSchema,
 robotCounts:z.array(z.number().int().min(1).max(30)).min(1).max(4)
}).strict().superRefine((value,ctx)=>{
 if(new Set(value.robotCounts).size!==value.robotCounts.length)
  ctx.addIssue({code:'custom',path:['robotCounts'],message:'Повторение количества роботов в вариантах.'});
 if(value.finance.annualRequiredJobs>value.scenario.workload.demandPerHour*value.scenario.workload.shiftHours*value.finance.workdaysPerYear)
  ctx.addIssue({code:'custom',path:['finance','annualRequiredJobs'],message:'Годовой план превышает входящий поток заданий.'});
});
export type CompareFinance=z.infer<typeof compareFinanceSchema>;
export type ComparisonRequest=z.infer<typeof comparisonRequestSchema>;
const finite=z.number().finite();
export const processCaseSchema=z.object({
 engine:z.literal('JaamSim'),engineVersion:z.literal('2026-05'),modelHash:z.string().regex(/^[a-f0-9]{64}$/),
 arrived:z.number().int().min(0),completed:z.number().int().min(0),backlog:z.number().int().min(0),
 queueMeanMinutes:finite.min(0),utilization:finite.min(0).max(1.000001),
 capacity:z.number().int().min(1),serviceSeconds:finite.gt(0),completedPerHour:finite.min(0)
}).passthrough();
const optionSchema=processCaseSchema.extend({
 robotCount:z.number().int().min(1),capexRub:finite.min(0),
 annualOpexRub:finite.min(0),annualBaselineCostRub:finite.min(0),
 baselineTcoRub:finite.min(0),robotTcoRub:finite.min(0),
 annualEnergyKwhEstimated:finite.min(0),annualIncrementalJobs:finite,
 annualAdditionalContributionRub:finite,annualNetBenefitRub:finite,
 roiPercent:finite.nullable(),npvRub:finite.nullable(),paybackYears:finite.min(0).nullable(),
 meetsDemand:z.boolean(),warnings:z.array(z.string())
});
export const comparisonResultSchema=z.object({
 engine:z.literal('JaamSim'),engineVersion:z.literal('2026-05'),simulationClass:z.literal('DES_PROCESS_FLOW'),
 routeMeters:finite.min(0),robotTaskSeconds:finite.gt(0),
 baseline:processCaseSchema,options:z.array(optionSchema).min(1).max(4),
 peak:z.object({demandMultiplier:z.literal(1.25),baseline:processCaseSchema,options:z.array(optionSchema).min(1).max(4)}),
 inputs:compareFinanceSchema,modelLimitations:z.array(z.string()).min(1),
 provenance:z.object({software:z.literal('JaamSim'),release:z.literal('2026-05'),
 sha256:z.string().regex(/^[a-f0-9]{64}$/),reproducibleSeed:z.number().int().min(1)})
}).superRefine((v,ctx)=>{
 for(const [name,group] of [['normal',v],['peak',v.peak]] as const){
  for(const item of group.options)if(item.arrived!==group.baseline.arrived||item.robotCount!==item.capacity)
   ctx.addIssue({code:'custom',message:'Несопоставимые входные потоки или парк в сценарии '+name});
 }
});
export type ComparisonResult=z.infer<typeof comparisonResultSchema>;
export const initialCompareFinance:CompareFinance={baselineWorkers:2,baselineTaskSeconds:180,
 baselineAnnualCostRub:0,residualHumanCostAnnualRub:0,robotUnitPriceRub:0,installationRub:0,
 infrastructureRub:0,chargersRub:0,annualMaintenanceRub:0,electricityRubPerKwh:0,
 workdaysPerYear:250,horizonYears:5,discountRatePercent:15,annualRequiredJobs:1000,marginRubPerAdditionalJob:0};
