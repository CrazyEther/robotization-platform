import type {SimulationScenarioV2} from './contracts';

export type Point2D={x:number;y:number};
export type RectObstacle={id:string;x:number;y:number;w:number;h:number};
export type NavigationRoute={points:Point2D[];distanceMeters:number;planner:'native-visibility/1'};

const EPS=1e-9;
const distance=(a:Point2D,b:Point2D)=>Math.hypot(b.x-a.x,b.y-a.y);
const finite=(value:number,name:string)=>{
 if(!Number.isFinite(value))throw new RangeError(name+' must be finite');
 return value;
};
export function conservativeFootprintRadius(
 dimensions:{lengthM:number;widthM:number},safetyClearanceMeters:number,
):number{
 const length=finite(dimensions.lengthM,'lengthM'),width=finite(dimensions.widthM,'widthM');
 const clearance=finite(safetyClearanceMeters,'safetyClearanceMeters');
 if(length<=0||width<=0||clearance<0)throw new RangeError('Footprint dimensions must be positive and clearance nonnegative');
 return Math.hypot(length,width)/2+clearance;
}
const inflate=(r:RectObstacle,amount:number):RectObstacle=>({
 ...r,x:r.x-amount,y:r.y-amount,w:r.w+2*amount,h:r.h+2*amount,
});
function insideClosed(point:Point2D,r:RectObstacle):boolean{
 return point.x>=r.x-EPS&&point.x<=r.x+r.w+EPS&&point.y>=r.y-EPS&&point.y<=r.y+r.h+EPS;
}
function segmentHitsClosedRect(a:Point2D,b:Point2D,r:RectObstacle):boolean{
 let t0=0,t1=1;
 const dx=b.x-a.x,dy=b.y-a.y;
 const checks:[number,number][]=[
  [-dx,a.x-r.x],[dx,r.x+r.w-a.x],[-dy,a.y-r.y],[dy,r.y+r.h-a.y],
 ];
 for(const [p,q] of checks){
  if(Math.abs(p)<EPS){if(q<0)return false;continue;}
  const t=q/p;
  if(p<0){if(t>t1)return false;if(t>t0)t0=t;}
  else{if(t<t0)return false;if(t<t1)t1=t;}
 }
 return t0<=t1;
}
function segmentClear(a:Point2D,b:Point2D,obstacles:RectObstacle[]):boolean{
 for(const obstacle of obstacles){
  const inner={...obstacle,x:obstacle.x+EPS,y:obstacle.y+EPS,w:obstacle.w-2*EPS,h:obstacle.h-2*EPS};
  if(inner.w>0&&inner.h>0&&segmentHitsClosedRect(a,b,inner))return false;
 }
 return true;
}
function validateObstacle(obstacle:RectObstacle):void{
 finite(obstacle.x,'obstacle.x');finite(obstacle.y,'obstacle.y');
 finite(obstacle.w,'obstacle.w');finite(obstacle.h,'obstacle.h');
 if(!obstacle.id||obstacle.w<=0||obstacle.h<=0)throw new RangeError('Obstacle must have id and positive size');
}
export function planVisibilityRoute(input:{
 bounds:{width:number;height:number};start:Point2D;end:Point2D;
 obstacles:RectObstacle[];clearanceRadius:number;
}):NavigationRoute|null{
 const width=finite(input.bounds.width,'bounds.width'),height=finite(input.bounds.height,'bounds.height');
 const clearance=finite(input.clearanceRadius,'clearanceRadius');
 if(width<=0||height<=0||clearance<0||width<=2*clearance||height<=2*clearance)
  throw new RangeError('Invalid navigation bounds or clearance');
 if(input.obstacles.length>500)throw new RangeError('native-visibility/1 supports at most 500 obstacles');
 input.obstacles.forEach(validateObstacle);
 const navigable=(p:Point2D)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&
  p.x>=clearance-EPS&&p.x<=width-clearance+EPS&&p.y>=clearance-EPS&&p.y<=height-clearance+EPS;
 if(!navigable(input.start)||!navigable(input.end))return null;
 const inflated=input.obstacles.map(o=>inflate(o,clearance));
 if(inflated.some(o=>insideClosed(input.start,o)||insideClosed(input.end,o)))return null;
 const candidates:Point2D[]=[input.start,input.end];
 for(const o of inflated){
  const corners=[
   {x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h},
  ];
  for(const corner of corners){
   if(!navigable(corner))continue;
   const blockedByOther=inflated.some(other=>other.id!==o.id&&
    corner.x>other.x+EPS&&corner.x<other.x+other.w-EPS&&
    corner.y>other.y+EPS&&corner.y<other.y+other.h-EPS);
   if(!blockedByOther)candidates.push(corner);
  }
 }
 const nodes:Point2D[]=[];
 const seen=new Set<string>();
 for(const p of candidates){
  const key=p.x.toFixed(9)+','+p.y.toFixed(9);
  if(!seen.has(key)){seen.add(key);nodes.push(p);}
 }
 const costs=new Array<number>(nodes.length).fill(Infinity),previous=new Array<number>(nodes.length).fill(-1);
 const visited=new Uint8Array(nodes.length);costs[0]=0;
 for(let step=0;step<nodes.length;step++){
  let current=-1,best=Infinity;
  for(let i=0;i<nodes.length;i++)if(!visited[i]&&costs[i]<best){best=costs[i];current=i;}
  if(current<0)break;if(current===1)break;visited[current]=1;
  for(let next=0;next<nodes.length;next++){
   if(next===current||visited[next]||!segmentClear(nodes[current],nodes[next],inflated))continue;
   const candidate=best+distance(nodes[current],nodes[next]);
   if(candidate+EPS<costs[next]){costs[next]=candidate;previous[next]=current;}
  }
 }
 if(!Number.isFinite(costs[1]))return null;
 const path:Point2D[]=[];for(let cursor=1;cursor!==-1;cursor=previous[cursor])path.push(nodes[cursor]);
 path.reverse();
 return {points:path,distanceMeters:costs[1],planner:'native-visibility/1'};
}

export function planScenarioRoute(input:{
 scenario:SimulationScenarioV2;floorId:string;startObjectId:string;endObjectId:string;
 robotId:string;safetyClearanceMeters:number;
}):NavigationRoute|null{
 const floor=input.scenario.facility.floors.find(item=>item.id===input.floorId);
 if(!floor)throw new Error('Unknown floor: '+input.floorId);
 const startObject=floor.objects.find(item=>item.id===input.startObjectId);
 const endObject=floor.objects.find(item=>item.id===input.endObjectId);
 if(!startObject||!endObject)throw new Error('Unknown route endpoint facility object.');
 const robot=input.scenario.robots.find(item=>item.id===input.robotId);
 if(!robot)throw new Error('Unknown robot: '+input.robotId);
 const blocking=floor.objects.filter(item=>item.blocking&&item.id!==startObject.id&&item.id!==endObject.id);
 if(blocking.some(item=>Math.abs(item.geometry.rotationDeg%360)>EPS))
  throw new Error('native-visibility/1 supports axis-aligned blocking geometry only.');
 const radius=conservativeFootprintRadius(robot.dimensions,input.safetyClearanceMeters);
 const center=(object:typeof startObject):Point2D=>({
  x:object.geometry.x+object.geometry.w/2,y:object.geometry.y+object.geometry.h/2,
 });
 return planVisibilityRoute({
  bounds:{width:floor.widthMeters,height:floor.heightMeters},
  start:center(startObject),end:center(endObject),clearanceRadius:radius,
  obstacles:blocking.map(object=>({
   id:object.id,x:object.geometry.x,y:object.geometry.y,w:object.geometry.w,h:object.geometry.h,
  })),
 });
}
