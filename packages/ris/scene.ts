import {createScenario,layoutSchema,sectorTemplates,type Layout,type Sector} from './contracts';
import type {CloudResult} from './cloud';

type Cell={x:number;y:number};
export type SceneTool='pickup'|'dropoff'|'add'|'remove';
const inside=(point:Cell,layout:Layout)=>Number.isInteger(point.x)&&Number.isInteger(point.y)&&point.x>=0&&point.y>=0&&point.x<layout.width&&point.y<layout.height;
const occupies=(point:Cell,rect:Layout['obstacles'][number])=>point.x>=rect.x&&point.x<rect.x+rect.w&&point.y>=rect.y&&point.y<rect.y+rect.h;
export function applySceneTool(layout:Layout,tool:SceneTool,point:Cell):Layout{
 if(!inside(point,layout))return layout;
 if(tool==='remove'){
  const obstacles=layout.obstacles.filter(rect=>!occupies(point,rect));
  return {...layout,obstacles};
 }
 if(tool==='pickup'||tool==='dropoff'){
  const other=tool==='pickup'?'dropoff':'pickup';
  if(layout[other].x===point.x&&layout[other].y===point.y||layout.obstacles.some(rect=>occupies(point,rect)))return layout;
  return {...layout,[tool]:point};
 }
 if(layout.obstacles.length>=30||layout.obstacles.some(rect=>occupies(point,rect))||[layout.pickup,layout.dropoff].some(p=>p.x===point.x&&p.y===point.y))return layout;
 return {...layout,obstacles:[...layout.obstacles,{x:point.x,y:point.y,w:1,h:1}]};
}
export function importSceneLayout(raw:string):Layout{
 if(raw.length>150000)throw Error('Файл помещения слишком большой');
 const parsed:unknown=JSON.parse(raw);
 const candidate=typeof parsed==='object'&&parsed!==null&&'layout' in parsed?(parsed as {layout:unknown}).layout:parsed;
 const layout=layoutSchema.parse(candidate);
 if(!inside(layout.pickup,layout)||!inside(layout.dropoff,layout))throw Error('Точки загрузки и разгрузки находятся за пределами помещения');
 if(layout.obstacles.some(rect=>rect.x+rect.w>layout.width||rect.y+rect.h>layout.height||[layout.pickup,layout.dropoff].some(p=>occupies(p,rect))))throw Error('Препятствия перекрывают точки или выходят за пределы помещения');
 return layout;
}
export function scenarioTemplate(sector:Sector){return createScenario(sector);}
export function sectorLabel(sector:Sector){return sectorTemplates[sector].title;}
type Frame=CloudResult['trajectory'][number];
export function sampleRobot(frames:Frame[],time:number,robotId:string):{x:number;y:number;state:string}|null{
 const own=frames.filter(p=>p.robotId===robotId);
 if(!own.length)return null;
 const last=own[own.length-1];
 if(time>=last.t)return {x:last.x,y:last.y,state:last.state};
 const nextIndex=own.findIndex(p=>p.t>=time);
 if(nextIndex<=0)return {x:own[0].x,y:own[0].y,state:own[0].state};
 const a=own[nextIndex-1],b=own[nextIndex],ratio=(time-a.t)/(b.t-a.t||1);
 return {x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio,state:b.state};
}
