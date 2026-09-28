import {z} from 'zod';
import {
 compileScenario,runProcessExperiment,runProcessNetwork,simulationScenarioSchema,
 type ProcessExperiment,type ProcessRun,type SimulationScenarioV2,
} from '../simulation-core';

const finite=z.number().finite();
export const simulationStudyLimits={
 maxReplications:30,
 maxTasks:50_000,
 maxCyclicTransitionsPerTask:128,
 maxTransitions:2_000_000,
} as const;
const STUDY_TASK_BUDGET=simulationStudyLimits.maxTasks;
const CYCLIC_MAX_TRANSITIONS_PER_TASK=simulationStudyLimits.maxCyclicTransitionsPerTask;
const STUDY_TRANSITION_BUDGET=simulationStudyLimits.maxTransitions;

type ProcessGraphShape={process:{nodes:Array<{id:string}>;edges:Array<{from:string;to:string}>}};
const hasDirectedCycle=(nodes:Array<{id:string}>,edges:Array<{from:string;to:string}>)=>{
 const outgoing=new Map(nodes.map(node=>[node.id,[] as string[]] as const));
 const indegree=new Map<string,number>(nodes.map(node=>[node.id,0]));
 for(const edge of edges){
  const targets=outgoing.get(edge.from);
  if(!targets||!indegree.has(edge.to))continue;
  targets.push(edge.to);
  indegree.set(edge.to,(indegree.get(edge.to)??0)+1);
 }
 const queue=nodes.filter(node=>(indegree.get(node.id)??0)===0).map(node=>node.id);
 let visited=0;
 for(let head=0;head<queue.length;head++){
  const id=queue[head];visited++;
  for(const next of outgoing.get(id)??[]){
   const remaining=(indegree.get(next)??0)-1;
   indegree.set(next,remaining);
   if(remaining===0)queue.push(next);
  }
 }
 return visited!==nodes.length;
};
const transitionLimitFor=(scenario:ProcessGraphShape)=>
 hasDirectedCycle(scenario.process.nodes,scenario.process.edges)
  ?CYCLIC_MAX_TRANSITIONS_PER_TASK
  :Math.max(8,scenario.process.nodes.length*2);
export const baselineMobileSchema=z.object({
 workers:z.number().int().min(1).max(1000),
 speedMps:finite.positive().max(10),
 serviceSeconds:finite.min(0).max(86400),
}).strict();

export const simulationStudyRequestSchema=z.object({
 scenario:simulationScenarioSchema,
 robotId:z.string().trim().min(1).max(128),
 baseline:baselineMobileSchema,
 replications:z.number().int().min(1).max(simulationStudyLimits.maxReplications),
 safetyClearanceMeters:finite.min(0).max(10),
 samplePeriodSeconds:finite.positive().max(60),
}).strict().superRefine((value,ctx)=>{
 const tasksPerRun=value.scenario.workload.demandPerHour*value.scenario.workload.shiftHours;
 const totalTasks=tasksPerRun*(value.replications*2+2);
 if(totalTasks>STUDY_TASK_BUDGET)
  ctx.addIssue({code:'custom',message:'Simulation study exceeds the edge task budget'});
 const transitionBudget=totalTasks*transitionLimitFor(value.scenario);
 if(transitionBudget>STUDY_TRANSITION_BUDGET)
  ctx.addIssue({code:'custom',message:'Simulation study exceeds the transition budget'});
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
 const maxTransitionsPerTask=transitionLimitFor(scenario);
 const robotRun=runProcessNetwork(scenario,{transport,maxTransitionsPerTask});
 const baselineRun=runProcessNetwork(baselineScenario,{transport:baselineTransport,maxTransitionsPerTask});
 const robotExperiment=runProcessExperiment(scenario,{replications:input.replications,transport,maxTransitionsPerTask});
 const baselineExperiment=runProcessExperiment(baselineScenario,{replications:input.replications,transport:baselineTransport,maxTransitionsPerTask});
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
