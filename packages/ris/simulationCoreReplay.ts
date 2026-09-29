import type {SimulationScenarioV2} from '../simulation-core/contracts';
import type {EventTrace} from '../simulation-core/trace';

export type SimulationReplayRobot={
 id:string;x:number;y:number;state:string;taskId:string|null;batteryPercent?:number;
};
export type SimulationReplayCargo={
 id:string;taskId:string;x:number;y:number;
 phase:'input'|'loaded'|'processing'|'output'|'waiting'|'delivered';
 attachedRobotId:string|null;
};
export type SimulationReplayFrame={
 t:number;robots:SimulationReplayRobot[];cargos:SimulationReplayCargo[];created:number;completed:number;backlog:number;
};

type RobotState=SimulationReplayRobot&{floorId:string};
type CargoState=SimulationReplayCargo&{deliveredAt?:number;originStage:'input'|'output'};

const center=(object:SimulationScenarioV2['facility']['floors'][number]['objects'][number])=>({
 x:object.geometry.x+object.geometry.w/2,
 y:object.geometry.y+object.geometry.h/2,
});

function initialRobotLocation(scenario:SimulationScenarioV2){
 const nodes=new Map(scenario.process.nodes.map(node=>[node.id,node] as const));
 const firstTransport=scenario.process.edges.find(edge=>edge.mode==='transport');
 const sourceObjectId=firstTransport?nodes.get(firstTransport.from)?.facilityObjectId:undefined;
 if(sourceObjectId){
  for(const floor of scenario.facility.floors){
   const object=floor.objects.find(item=>item.id===sourceObjectId);
   if(object)return {...center(object),floorId:floor.id};
  }
 }
 for(const floor of scenario.facility.floors){
  const object=floor.objects.find(item=>item.kind==='station');
  if(object)return {...center(object),floorId:floor.id};
 }
 return {x:0,y:0,floorId:scenario.facility.floors[0].id};
}

const stateFromMotion=(event:EventTrace['events'][number])=>{
 const role=typeof event.data?.motionRole==='string'?event.data.motionRole:'moving';
 if(role==='loaded')return 'loaded';
 if(role==='charge-travel')return 'charging-route';
 if(role==='reposition')return 'moving';
 return role;
};

const cloneFrame=(t:number,states:Map<string,RobotState>,cargos:Map<string,CargoState>,
 created:number,completed:number):SimulationReplayFrame=>({
 t,
 robots:[...states.values()].map(({id,x,y,state,taskId,batteryPercent})=>({
  id,x,y,state,taskId,...(batteryPercent===undefined?{}:{batteryPercent}),
 })).sort((a,b)=>a.id.localeCompare(b.id)),
 cargos:[...cargos.values()].map(({id,taskId,x,y,phase,attachedRobotId})=>({
  id,taskId,x,y,phase,attachedRobotId,
 })).sort((a,b)=>a.id.localeCompare(b.id)),
 created,completed,backlog:Math.max(0,created-completed),
});

function downsample(frames:SimulationReplayFrame[],maxFrames:number):SimulationReplayFrame[]{
 if(frames.length<=maxFrames)return frames;
 if(maxFrames<2)throw new RangeError('maxFrames must be >= 2');
 const result:SimulationReplayFrame[]=[frames[0]];
 const interior=maxFrames-2;
 for(let index=1;index<=interior;index++){
  const source=Math.round(index*(frames.length-1)/(maxFrames-1));
  result.push(frames[Math.min(frames.length-2,Math.max(1,source))]);
 }
 result.push(frames.at(-1)!);
 const unique:SimulationReplayFrame[]=[];
 for(const frame of result)if(!unique.length||unique.at(-1)!.t!==frame.t)unique.push(frame);
 return unique;
}

export function buildSimulationCoreReplay(
 scenario:SimulationScenarioV2,
 trace:EventTrace,
 options:{maxFrames?:number}={},
):SimulationReplayFrame[]{
 if(trace.scenarioHash!==scenario.scenarioHash)throw new Error('Replay trace does not match the scenario hash.');
 const initial=initialRobotLocation(scenario);
 const states=new Map<string,RobotState>();
 const cargos=new Map<string,CargoState>();
 for(const spec of scenario.robots){
  for(let index=1;index<=spec.fleetSize;index++){
   const id=spec.id+'#'+index;
   states.set(id,{id,x:initial.x,y:initial.y,floorId:initial.floorId,state:'idle',taskId:null,batteryPercent:100});
  }
 }
 let created=0,completed=0;
 const frames:SimulationReplayFrame[]=[cloneFrame(0,states,cargos,created,completed)];
 const locations=new Map(scenario.facility.floors.flatMap(floor=>floor.objects.map(object=>[
  object.id,{...center(object),floorId:floor.id},
 ] as const)));
 const events=trace.events;
 for(let cursor=0;cursor<events.length;){
  const t=events[cursor].t;
  let next=cursor;
  while(next<events.length&&Math.abs(events[next].t-t)<=1e-9){
   const event=events[next];
   if(event.type==='task.created')created++;
   if(event.type==='task.completed')completed++;
   if(event.entityId){
    const location=typeof event.data?.locationId==='string'?
     locations.get(event.data.locationId):undefined;
    const at=event.position??location;
    if(event.type==='entity.created'){
     const originStage=event.data?.stage==='output'?'output':'input';
     cargos.set(event.entityId,{
      id:event.entityId,taskId:event.taskId??'',x:at?.x??initial.x,y:at?.y??initial.y,
      phase:originStage,attachedRobotId:null,originStage,
     });
    }else{
     const cargo=cargos.get(event.entityId);
     if(cargo){
      if(at){cargo.x=at.x;cargo.y=at.y;}
      if(event.type==='entity.loaded'){
       cargo.phase='loaded';cargo.attachedRobotId=event.resourceId??null;
      }else if(event.type==='entity.unloaded'){
       cargo.attachedRobotId=null;cargo.phase=cargo.originStage;
      }else if(event.type==='entity.processing'){
       cargo.phase='processing';cargo.attachedRobotId=null;
      }else if(event.type==='entity.consumed'){
       cargos.delete(event.entityId);
      }else if(event.type==='entity.completed'){
       cargo.phase='delivered';cargo.attachedRobotId=null;cargo.deliveredAt=t;
      }
     }
    }
   }
   if(event.resourceId&&states.has(event.resourceId)){
    const robot=states.get(event.resourceId)!;
    if(event.position){
     robot.x=event.position.x;robot.y=event.position.y;robot.floorId=event.position.floorId;
    }
    if(event.type==='robot.motion'){
     robot.state=stateFromMotion(event);
     robot.taskId=event.taskId??robot.taskId;
     for(const cargo of cargos.values())if(cargo.attachedRobotId===robot.id){
      cargo.x=robot.x;cargo.y=robot.y;
     }
    }else if(event.type==='robot.waiting'){
     robot.state='waiting';robot.taskId=event.taskId??robot.taskId;
    }else if(event.type==='robot.charging'){
     const phase=event.data?.phase;
     robot.state=phase==='completed'?'idle':'charging';
     if(typeof event.data?.soc==='number')robot.batteryPercent=event.data.soc*100;
     if(phase==='completed')robot.taskId=null;
    }else if(event.type==='robot.failed'){
     robot.state='failed';
    }else if(event.type==='process.started'&&event.data?.phase==='transport'){
     robot.state='loading';robot.taskId=event.taskId??null;
    }else if(event.type==='process.completed'&&event.data?.phase==='transport'){
     robot.state='idle';robot.taskId=null;
    }
   }
   next++;
  }
  for(const [id,cargo] of cargos){
   if(cargo.phase==='delivered'&&cargo.deliveredAt!==undefined&&t-cargo.deliveredAt>20)cargos.delete(id);
  }
  const frame=cloneFrame(t,states,cargos,created,completed);
  if(t===0)frames[0]=frame;else frames.push(frame);
  cursor=next;
 }
 const maxFrames=options.maxFrames??20_000;
 if(!Number.isInteger(maxFrames)||maxFrames<2||maxFrames>100_000)
  throw new RangeError('maxFrames must be an integer from 2 to 100000');
 return downsample(frames,maxFrames);
}
