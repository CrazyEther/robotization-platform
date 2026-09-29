import {createScenario,type SimulationInput} from './contracts';
import type {AnyLogicSceneObject,AnyLogicSite} from './anylogic';
import {compileEditorScenario} from './simulationCoreAdapter';
import {compileScenario,type SimulationScenarioV2} from '../simulation-core';

const object=(id:string,kind:AnyLogicSceneObject['kind'],label:string,
 x:number,y:number,w:number,h:number,blocking:boolean,capacity=1):AnyLogicSceneObject=>
 ({id,kind,label,x,y,w,h,blocking,capacity});

/** A process demonstrator, not a calibrated representation of a customer's plant. */
export function createFactoryFlowSeed():{scenario:SimulationInput;objects:AnyLogicSceneObject[]}{
 const scenario=createScenario('factory');
 scenario.layout={width:50,height:30,pickup:{x:4,y:8},dropoff:{x:44,y:24},obstacles:[]};
 scenario.robot={...scenario.robot,count:2,speedMps:1,loadSeconds:12,unloadSeconds:12};
 scenario.workload={...scenario.workload,demandPerHour:12,shiftHours:.5,loadKg:90};
 const objects=[
  object('demo-raw-rack','rack','Стеллаж заготовок',8,3,3,10,true),
  object('demo-finished-rack','rack','Стеллаж готовой продукции',39,18,3,7,true),
  object('demo-machine-body','wall','Корпус станка',21,4,5,2,true),
  object('demo-machine','station','Пост обработки · станок',22,7,3,3,false,1),
 ];
 scenario.layout.obstacles=objects.filter(o=>o.blocking).map(o=>({
  x:o.x,y:o.y,w:o.w,h:o.h,
 }));
 return {scenario,objects};
}
export function compileFactoryFlowScenario(input:{
 scenario:SimulationInput;objects:AnyLogicSceneObject[];site:AnyLogicSite;
 processingSeconds:number;
}):SimulationScenarioV2{
 const {scenario,objects,site,processingSeconds}=input;
 if(scenario.sector!=='factory')throw new Error('Factory demonstration requires the factory sector.');
 if(!Number.isFinite(processingSeconds)||processingSeconds<1||processingSeconds>86400)
  throw new RangeError('Processing duration must be from 1 to 86400 seconds.');
 const base=compileEditorScenario({scenario,objects,site});
 const floors=base.facility.floors.map(floor=>({...floor,objects:floor.objects.map(item=>
  item.id==='demo-machine'?{...item,kind:'machine' as const,blocking:false,
   properties:{...item.properties,operation:'加工 заготовки'}}:item,
 )}));
 if(!floors.flatMap(floor=>floor.objects).some(item=>item.id==='demo-machine'))
  throw new Error('Process machine station is missing from the facility.');
 const process={
  schemaVersion:'ris-process/1' as const,id:'factory-material-flow',
  name:'Заготовка → обработка → готовый поддон',
  entityType:'pallet',
  nodes:[
   {id:'raw-material',label:'Заготовка на складе',kind:'source' as const,
    facilityObjectId:'editor-pickup',properties:{}},
   {id:'machine-operation',label:'Обработка на станке',kind:'process' as const,
    facilityObjectId:'demo-machine',durationSeconds:processingSeconds,properties:{transformsLoad:true}},
   {id:'finished-goods',label:'Склад готовой продукции',kind:'sink' as const,
    facilityObjectId:'editor-dropoff',properties:{}},
  ],
  edges:[
   {id:'inbound-pallet',from:'raw-material',to:'machine-operation',mode:'transport' as const},
   {id:'outbound-pallet',from:'machine-operation',to:'finished-goods',mode:'transport' as const},
  ],
 };
 return compileScenario({...base,scenarioHash:undefined,
  id:'factory-two-leg-demo',name:'Производственный цикл с обработкой и доставкой',
  facility:{...base.facility,floors},process,
 });
}
