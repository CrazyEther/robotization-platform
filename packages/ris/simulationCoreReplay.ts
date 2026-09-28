import type {SimulationScenarioV2} from '../simulation-core/contracts';
import type {EventTrace} from '../simulation-core/trace';

export type SimulationReplayRobot={
 id:string;x:number;y:number;state:string;taskId:string|null;batteryPercent?:number;
};
export type SimulationReplayFrame={
 t:number;robots:SimulationReplayRobot[];created:number;completed:number;backlog:number;
};

type RobotState=SimulationReplayRobot&{floorId:string};

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

const cloneFrame=(t:number,states:Map<string,RobotState>,created:number,completed:number):SimulationReplayFrame=>({
 t,
 robots:[...states.values()].map(({id,x,y,state,taskId,batteryPercent})=>({
  id,x,y,state,taskId,...(batteryPercent===undefined?{}:{batteryPercent}),
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
 for(const spec of scenario.robots){
  for(let index=1;index<=spec.fleetSize;index++){
   const id=spec.id+'#'+index;
   states.set(id,{id,x:initial.x,y:initial.y,floorId:initial.floorId,state:'idle',taskId:null,batteryPercent:100});
  }
 }
 let created=0,completed=0;
 const frames:SimulationReplayFrame[]=[cloneFrame(0,states,created,completed)];
 const events=trace.events;
 for(let cursor=0;cursor<events.length;){
  const t=events[cursor].t;
  let next=cursor;
  while(next<events.length&&Math.abs(events[next].t-t)<=1e-9){
   const event=events[next];
   if(event.type==='task.created')created++;
   if(event.type==='task.completed')completed++;
   if(event.resourceId&&states.has(event.resourceId)){
    const robot=states.get(event.resourceId)!;
    if(event.position){
     robot.x=event.position.x;robot.y=event.position.y;robot.floorId=event.position.floorId;
    }
    if(event.type==='robot.motion'){
     robot.state=stateFromMotion(event);
     robot.taskId=event.taskId??robot.taskId;
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
  const frame=cloneFrame(t,states,created,completed);
  if(t===0)frames[0]=frame;else frames.push(frame);
  cursor=next;
 }
 const maxFrames=options.maxFrames??20_000;
 if(!Number.isInteger(maxFrames)||maxFrames<2||maxFrames>100_000)
  throw new RangeError('maxFrames must be an integer from 2 to 100000');
 return downsample(frames,maxFrames);
}
