import {z} from 'zod';
import {
 compileScenario,runProcessExperiment,runProcessNetwork,simulationScenarioSchema,
 type ProcessExperiment,type ProcessRun,type SimulationScenarioV2,
} from '../simulation-core';

const finite=z.number().finite();
export const baselineMobileSchema=z.object({
 workers:z.number().int().min(1).max(1000),
 speedMps:finite.positive().max(10),
 serviceSeconds:finite.min(0).max(86400),
}).strict();

export const simulationStudyRequestSchema=z.object({
 scenario:simulationScenarioSchema,
 robotId:z.string().trim().min(1).max(128),
 baseline:baselineMobileSchema,
 replications:z.number().int().min(1).max(30),
 safetyClearanceMeters:finite.min(0).max(10),
 samplePeriodSeconds:finite.positive().max(60),
}).strict().superRefine((value,ctx)=>{
 const expectedRuns=value.scenario.workload.demandPerHour*value.scenario.workload.shiftHours*value.replications*2;
 if(expectedRuns>50_000)ctx.addIssue({code:'custom',message:'Simulation study exceeds the edge compute safety budget'});
});
export type SimulationStudyRequest=z.infer<typeof simulationStudyRequestSchema>;

export type SimulationCoreStudy={
 engine:{name:'ris-simulation-study';version:'1'};
 scenarioHash:string;robotId:string;robotCount:number;replications:number;
 robot:{scenarioHash:string;run:ProcessRun;experiment:ProcessExperiment};
 baseline:{scenarioHash:string;config:z.infer<typeof baselineMobileSchema>;run:ProcessRun;experiment:ProcessExperiment};
 warnings:string[];
};

function buildBaselineScenario(
 scenario:SimulationScenarioV2,
 baseline:z.infer<typeof baselineMobileSchema>,
):SimulationScenarioV2{
 const payload=Math.max(1,scenario.workload.unitLoadKg*2);
 return compileScenario({
  ...scenario,scenarioHash:undefined,
  id:scenario.id+'-baseline',name:scenario.name+' · baseline mobile process',
  robots:[{
   id:'baseline-mobile-resource',label:'Baseline mobile resource',fleetSize:baseline.workers,
   capacity:{payloadKg:payload},
   kinematics:{maxSpeedMps:baseline.speedMps,accelerationMps2:1,decelerationMps2:1,turnRadiusM:0},
   dimensions:{lengthM:.6,widthM:.6,heightM:1.8},
   battery:{capacityWh:10_000_000,chargeW:1_000_000,whPerMeter:.000001,minSoc:0},
   handling:{loadSeconds:baseline.serviceSeconds/2,unloadSeconds:baseline.serviceSeconds/2},
   navigationType:'free-space',
  }],
 });
}

export function runSimulationCoreStudy(raw:SimulationStudyRequest):SimulationCoreStudy{
 const input=simulationStudyRequestSchema.parse(raw);
 const scenario=compileScenario(input.scenario);
 const robot=scenario.robots.find(item=>item.id===input.robotId);
 if(!robot)throw new Error('Simulation study robot is not present in the scenario: '+input.robotId);
 const transport={
  robotId:input.robotId,
  safetyClearanceMeters:input.safetyClearanceMeters,
  samplePeriodSeconds:input.samplePeriodSeconds,
 };
 const baselineScenario=buildBaselineScenario(scenario,input.baseline);
 const baselineTransport={
  robotId:'baseline-mobile-resource',
  safetyClearanceMeters:input.safetyClearanceMeters,
  samplePeriodSeconds:input.samplePeriodSeconds,
 };
 const robotRun=runProcessNetwork(scenario,{transport});
 const baselineRun=runProcessNetwork(baselineScenario,{transport:baselineTransport});
 const robotExperiment=runProcessExperiment(scenario,{replications:input.replications,transport});
 const baselineExperiment=runProcessExperiment(baselineScenario,{replications:input.replications,transport:baselineTransport});
 return {
  engine:{name:'ris-simulation-study',version:'1'},
  scenarioHash:scenario.scenarioHash,robotId:robot.id,robotCount:robot.fleetSize,replications:input.replications,
  robot:{scenarioHash:scenario.scenarioHash,run:robotRun,experiment:robotExperiment},
  baseline:{scenarioHash:baselineScenario.scenarioHash,config:input.baseline,run:baselineRun,experiment:baselineExperiment},
  warnings:[
   'Baseline and robotized variants use the same facility, process topology and workload; only mobile-resource parameters differ.',
   'Investment decisions should use replicated confidence bounds and validated site geometry, not a single replay.',
  ],
 };
}
