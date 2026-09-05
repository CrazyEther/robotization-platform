import type {Catalog} from './index';
import taxonomy from '../../data/process-templates.json';
export interface BusinessGoal{id:string;label:string}
export interface ProblemSignal{id:string;processId:string;question:string;requiredEvidence:string[];status:'assessment_required'}
export interface Operation{id:string;processId:string;label:string}
export interface ProcessTemplate{id:string;label:string;model:string;operationIds:string[]}
export interface AutomationApproach{id:string;level:'organization'|'digitization'|'control'|'mechanization'|'robotization';label:string}
export interface ProductConfiguration{id:string;productId:string;sourceIds:string[];scope:'unqualified_product_reference';missing:string[]}
export interface CompatibilityConstraint{id:string;processId:string;description:string;status:'requires_object_measurement'}
export interface Benefit{id:string;resourceKey:string;kind:string;sourceRef:string;value:number;unit:string}
/** This graph links observed product facts and engineering templates; hypotheses stay typed. */
export function buildKnowledgeGraph(catalog:Catalog){
 const nodes:Array<{id:string;type:string;status:string;data:unknown}>=[];const edges:Array<{from:string;to:string;relation:string;status:string}>=[];
 for(const goal of taxonomy.goals)nodes.push({id:'goal:'+goal.id,type:'BusinessGoal',status:'engineering_taxonomy',data:goal});
 for(const family of taxonomy.families){const p='process:'+family.id;nodes.push({id:p,type:'ProcessTemplate',status:'engineering_taxonomy',data:{...family,operationIds:['operation:'+family.id]}});nodes.push({id:'operation:'+family.id,type:'Operation',status:'engineering_taxonomy',data:{label:family.label}});nodes.push({id:'signal:'+family.id,type:'ProblemSignal',status:'assessment_required',data:{question:family.question,requiredEvidence:family.inputs}});nodes.push({id:'constraint:'+family.id,type:'CompatibilityConstraint',status:'requires_object_measurement',data:{description:family.constraint}});edges.push({from:p,to:'operation:'+family.id,relation:'contains',status:'engineering_taxonomy'},{from:'signal:'+family.id,to:p,relation:'investigates',status:'hypothesis'},{from:'constraint:'+family.id,to:p,relation:'constrains',status:'engineering_taxonomy'});}
 for(const source of catalog.sources)nodes.push({id:'source:'+source.id,type:'Source',status:source.retrievalStatus,data:source});
 for(const product of catalog.products){nodes.push({id:'product:'+product.id,type:'ProductConfiguration',status:'unqualified_product_reference',data:product});edges.push({from:'product:'+product.id,to:'process:'+product.familyId,relation:'candidate_for',status:'requires_object_measurement'});for(const id of product.sourceIds)edges.push({from:'product:'+product.id,to:'source:'+id,relation:'references',status:'source_reference'});for(const c of product.characteristics){const id='claim:'+product.id+':'+c.key;nodes.push({id,type:'Claim',status:c.status,data:c});edges.push({from:'product:'+product.id,to:id,relation:'has_claim',status:c.status},{from:id,to:'source:'+c.sourceId,relation:'supported_by',status:c.status});}}
 return {schemaVersion:'automation-knowledge/1',nodes,edges,limitations:['No product is technically compatible with an unmeasured object merely because it shares a process family.','Source references are not independent performance validation.']};
}
export function validateBenefitOverlap(benefits:Benefit[]){const keys=new Map<string,string>();const conflicts:string[]=[];for(const benefit of benefits){if(['time_released','nonfinancial'].includes(benefit.kind))continue;const previous=keys.get(benefit.resourceKey);if(previous)conflicts.push(`${previous} / ${benefit.id}: ${benefit.resourceKey}`);else keys.set(benefit.resourceKey,benefit.id);}return {valid:conflicts.length===0,conflicts};}
