import {ReservationTable,type Reservation} from './traffic';

export type ChargingCandidate={
 chargerId:string;capacity:number;arrivalTime:number;chargeSeconds:number;postChargeSeconds:number;
};
export type ChargingSlot=Reservation&{
 chargerId:string;channelId:string;score:number;
};

const validate=(candidate:ChargingCandidate)=>{
 if(!candidate.chargerId.trim())throw new Error('Charger id is required.');
 if(!Number.isInteger(candidate.capacity)||candidate.capacity<1)throw new RangeError('Charger capacity must be a positive integer.');
 if(!Number.isFinite(candidate.arrivalTime)||candidate.arrivalTime<0)throw new RangeError('Charger arrival time must be finite and >= 0.');
 if(!Number.isFinite(candidate.chargeSeconds)||candidate.chargeSeconds<=0)throw new RangeError('Charge duration must be finite and > 0.');
 if(!Number.isFinite(candidate.postChargeSeconds)||candidate.postChargeSeconds<0)throw new RangeError('Post-charge duration must be finite and >= 0.');
};

export class ChargingScheduler{
 private readonly reservations=new ReservationTable();

 previewBest(ownerId:string,candidates:ChargingCandidate[]):ChargingSlot{
  return this.plan(ownerId,candidates,false);
 }
 reserveBest(ownerId:string,candidates:ChargingCandidate[]):ChargingSlot{
  return this.plan(ownerId,candidates,true);
 }
 snapshot(){return this.reservations.snapshot();}

 private plan(ownerId:string,candidates:ChargingCandidate[],commit:boolean):ChargingSlot{
  if(!ownerId.trim())throw new Error('Charging owner id is required.');
  if(!candidates.length)throw new Error('At least one charging candidate is required.');
  let best:{candidate:ChargingCandidate;channelId:string;preview:Reservation;score:number}|null=null;
  for(const candidate of candidates){
   validate(candidate);
   for(let channel=1;channel<=candidate.capacity;channel++){
    const channelId='charger:'+candidate.chargerId+'#'+channel;
    const preview=this.reservations.preview({
     resourceId:channelId,ownerId,earliestStart:candidate.arrivalTime,duration:candidate.chargeSeconds,
    });
    const score=preview.end+candidate.postChargeSeconds;
    if(!best||score<best.score||(score===best.score&&channelId<best.channelId))
     best={candidate,channelId,preview,score};
   }
  }
  if(!best)throw new Error('No charging candidate is available.');
  const reservation=commit?this.reservations.reserve({
   resourceId:best.channelId,ownerId,earliestStart:best.candidate.arrivalTime,duration:best.candidate.chargeSeconds,
  }):best.preview;
  return {
   ...reservation,chargerId:best.candidate.chargerId,channelId:best.channelId,
   score:reservation.end+best.candidate.postChargeSeconds,
  };
 }
}
