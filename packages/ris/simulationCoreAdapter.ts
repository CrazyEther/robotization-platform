import type {SimulationInput} from './contracts';
import type {AnyLogicSceneObject,AnyLogicSite} from './anylogic';
import {compileScenario,type SimulationScenarioV2} from '../simulation-core';
import {compileLegacyScenario} from './legacySimulationCoreAdapter';

const kindMap:Record<AnyLogicSceneObject['kind'],'wall'|'rack'|'door'|'charger'|'station'|'lift'>={
 wall:'wall',rack:'rack',door:'door',charger:'charger',station:'station',elevator:'lift',
};

export function compileEditorScenario({scenario,objects,site}:{
 scenario:SimulationInput;objects:AnyLogicSceneObject[];site:AnyLogicSite;
}):SimulationScenarioV2{
 const base=compileLegacyScenario(scenario);
 const editorObjects=objects.map(object=>({
  id:object.id,label:object.label,kind:kindMap[object.kind],
  geometry:{x:object.x,y:object.y,w:object.w,h:object.h,rotationDeg:0},
  blocking:object.blocking,capacity:object.capacity,
  properties:{editorKind:object.kind},
 }));
 const endpoints=[
  {id:'editor-pickup',label:'Pickup',kind:'station' as const,
   geometry:{x:scenario.layout.pickup.x,y:scenario.layout.pickup.y,w:.5,h:.5,rotationDeg:0},
   blocking:false,capacity:1,properties:{role:'pickup'}},
  {id:'editor-dropoff',label:'Dropoff',kind:'station' as const,
   geometry:{x:scenario.layout.dropoff.x,y:scenario.layout.dropoff.y,w:.5,h:.5,rotationDeg:0},
   blocking:false,capacity:1,properties:{role:'dropoff'}},
 ];
 const process=structuredClone(base.process);
 const source=process.nodes.find(node=>node.kind==='source');
 const sink=process.nodes.find(node=>node.kind==='sink');
 if(source)source.facilityObjectId='editor-pickup';
 if(sink)sink.facilityObjectId='editor-dropoff';
 return compileScenario({
  ...base,scenarioHash:undefined,
  facility:{...base.facility,source:{
   type:site.sourceType,name:site.sourceName,geometryStatus:site.geometryStatus,
   dimensionsConfirmed:site.dimensionsConfirmed,siteSpecific:site.siteSpecific,
  },floors:[{...base.facility.floors[0],objects:[...editorObjects,...endpoints]}]},
  process,
 });
}
