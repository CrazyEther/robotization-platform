export type MotionKinematics={
 maxSpeedMps:number;
 accelerationMps2:number;
 decelerationMps2:number;
};
export type MotionProfile={
 kind:'triangular'|'trapezoidal';
 distanceMeters:number;
 peakSpeedMps:number;
 accelSeconds:number;
 cruiseSeconds:number;
 decelSeconds:number;
 totalSeconds:number;
 accelDistanceMeters:number;
 cruiseDistanceMeters:number;
 decelDistanceMeters:number;
 accelerationMps2:number;
 decelerationMps2:number;
};
export type MotionSample={
 t:number;
 distanceMeters:number;
 velocityMps:number;
 phase:'accelerating'|'cruising'|'decelerating'|'complete';
};
const positive=(value:number,name:string)=>{
 if(!Number.isFinite(value)||value<=0)throw new RangeError(name+' must be finite and > 0');
 return value;
};
export function planRestToRestMotion(distanceMeters:number,kinematics:MotionKinematics):MotionProfile{
 const distance=positive(distanceMeters,'distanceMeters');
 const vmax=positive(kinematics.maxSpeedMps,'maxSpeedMps');
 const acceleration=positive(kinematics.accelerationMps2,'accelerationMps2');
 const deceleration=positive(kinematics.decelerationMps2,'decelerationMps2');
 const accelAtMax=vmax*vmax/(2*acceleration);
 const decelAtMax=vmax*vmax/(2*deceleration);
 const reachesMax=distance>=accelAtMax+decelAtMax;
 const peak=reachesMax?vmax:Math.sqrt(2*distance*acceleration*deceleration/(acceleration+deceleration));
 const accelDistance=peak*peak/(2*acceleration);
 const decelDistance=peak*peak/(2*deceleration);
 const cruiseDistance=Math.max(0,distance-accelDistance-decelDistance);
 const accelSeconds=peak/acceleration;
 const cruiseSeconds=cruiseDistance/peak;
 const decelSeconds=peak/deceleration;
 return {
  kind:reachesMax?'trapezoidal':'triangular',distanceMeters:distance,peakSpeedMps:peak,
  accelSeconds,cruiseSeconds,decelSeconds,totalSeconds:accelSeconds+cruiseSeconds+decelSeconds,
  accelDistanceMeters:accelDistance,cruiseDistanceMeters:cruiseDistance,decelDistanceMeters:decelDistance,
  accelerationMps2:acceleration,decelerationMps2:deceleration,
 };
}
export function sampleMotion(profile:MotionProfile,timeSeconds:number):MotionSample{
 if(!Number.isFinite(timeSeconds)||timeSeconds<0||timeSeconds>profile.totalSeconds+1e-9)
  throw new RangeError('timeSeconds outside motion profile');
 const t=Math.min(timeSeconds,profile.totalSeconds);
 if(Math.abs(t-profile.totalSeconds)<=1e-9)
  return {t,distanceMeters:profile.distanceMeters,velocityMps:0,phase:'complete'};
 if(t<=profile.accelSeconds){
  return {t,distanceMeters:.5*profile.accelerationMps2*t*t,
   velocityMps:profile.accelerationMps2*t,phase:'accelerating'};
 }
 const afterAccel=t-profile.accelSeconds;
 if(afterAccel<=profile.cruiseSeconds){
  return {t,distanceMeters:profile.accelDistanceMeters+profile.peakSpeedMps*afterAccel,
   velocityMps:profile.peakSpeedMps,phase:'cruising'};
 }
 const decelTime=afterAccel-profile.cruiseSeconds;
 return {t,
  distanceMeters:profile.accelDistanceMeters+profile.cruiseDistanceMeters+
   profile.peakSpeedMps*decelTime-.5*profile.decelerationMps2*decelTime*decelTime,
  velocityMps:Math.max(0,profile.peakSpeedMps-profile.decelerationMps2*decelTime),
  phase:'decelerating'};
}
export type LinearMotionEvent={
 id:string;t:number;type:'robot.motion';resourceId:string;
 position:{floorId:string;x:number;y:number};
 data:{velocityMps:number;distanceMeters:number;phase:string};
};
export function generateLinearMotionEvents(input:{
 idPrefix:string;resourceId:string;floorId:string;
 start:{x:number;y:number};end:{x:number;y:number};startTimeSeconds:number;
 samplePeriodSeconds:number;kinematics:MotionKinematics;
}):LinearMotionEvent[]{
 const dx=input.end.x-input.start.x,dy=input.end.y-input.start.y;
 const distance=Math.hypot(dx,dy);
 const profile=planRestToRestMotion(distance,input.kinematics);
 positive(input.samplePeriodSeconds,'samplePeriodSeconds');
 if(!Number.isFinite(input.startTimeSeconds)||input.startTimeSeconds<0)throw new RangeError('startTimeSeconds must be finite and >= 0');
 const localTimes:number[]=[0];
 for(let t=input.samplePeriodSeconds;t<profile.totalSeconds-1e-9;t+=input.samplePeriodSeconds)localTimes.push(t);
 localTimes.push(profile.totalSeconds);
 return localTimes.map((local,index)=>{
  const sample=sampleMotion(profile,local),ratio=sample.distanceMeters/distance;
  return {
   id:input.idPrefix+'-motion-'+index,t:input.startTimeSeconds+local,type:'robot.motion' as const,
   resourceId:input.resourceId,
   position:{floorId:input.floorId,x:input.start.x+dx*ratio,y:input.start.y+dy*ratio},
   data:{velocityMps:sample.velocityMps,distanceMeters:sample.distanceMeters,phase:sample.phase},
  };
 });
}
