import type {z} from 'zod';
import type {durationModelSchema} from './contracts';

export type DurationModel=z.infer<typeof durationModelSchema>;

function standardNormal(random:()=>number):number{
 const u1=Math.max(Number.MIN_VALUE,1-random());
 const u2=random();
 return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
}

function gammaUnit(shape:number,random:()=>number):number{
 if(shape<1){
  const u=Math.max(Number.MIN_VALUE,random());
  return gammaUnit(shape+1,random)*Math.pow(u,1/shape);
 }
 const d=shape-1/3,c=1/Math.sqrt(9*d);
 for(let i=0;i<1_000_000;i++){
  const z=standardNormal(random),base=1+c*z;
  if(base<=0)continue;
  const v=base*base*base,u=random();
  if(u<1-.0331*z*z*z*z)return d*v;
  if(Math.log(Math.max(Number.MIN_VALUE,u))<.5*z*z+d*(1-v+Math.log(v)))return d*v;
 }
 throw new RangeError('Gamma sampler iteration safety limit exceeded');
}
const checked=(value:number)=>{
 if(!Number.isFinite(value)||value<0)throw new RangeError('Sampled duration must be finite and nonnegative');
 return value;
};

export function sampleDurationSeconds(model:DurationModel,random:()=>number):number{
 switch(model.kind){
  case 'fixed':return checked(model.seconds);
  case 'uniform':return checked(model.minSeconds+(model.maxSeconds-model.minSeconds)*random());
  case 'exponential':{
   const u=Math.max(Number.MIN_VALUE,1-random());
   return checked(-Math.log(u)*model.meanSeconds);
  }
  case 'lognormal':
   return checked(model.medianSeconds*Math.exp(model.sigma*standardNormal(random)));
  case 'gamma':
   return checked(gammaUnit(model.shape,random)*model.scaleSeconds);
  case 'empirical':{
   const index=Math.min(model.valuesSeconds.length-1,Math.floor(random()*model.valuesSeconds.length));
   return checked(model.valuesSeconds[index]);
  }
 }
}
