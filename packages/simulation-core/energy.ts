export type BatteryParameters={
 capacityWh:number;minSoc:number;chargeW:number;whPerMeter:number;
};
export type CycleEnergyAssessment={
 startEnergyWh:number;consumptionWh:number;reserveWh:number;
 energyAfterWh:number;socAfter:number;feasible:boolean;
};

function validateBattery(battery:BatteryParameters):void{
 if(!Number.isFinite(battery.capacityWh)||battery.capacityWh<=0)throw new RangeError('capacityWh must be finite and > 0');
 if(!Number.isFinite(battery.minSoc)||battery.minSoc<0||battery.minSoc>1)throw new RangeError('minSoc must be between 0 and 1');
 if(!Number.isFinite(battery.chargeW)||battery.chargeW<=0)throw new RangeError('chargeW must be finite and > 0');
 if(!Number.isFinite(battery.whPerMeter)||battery.whPerMeter<=0)throw new RangeError('whPerMeter must be finite and > 0');
}
export function motionEnergyWh(distanceMeters:number,battery:BatteryParameters):number{
 validateBattery(battery);
 if(!Number.isFinite(distanceMeters)||distanceMeters<0)throw new RangeError('distanceMeters must be finite and >= 0');
 return distanceMeters*battery.whPerMeter;
}
export function assessCycleEnergy(input:{
 battery:BatteryParameters;loadedMeters:number;emptyMeters:number;startEnergyWh?:number;
}):CycleEnergyAssessment{
 validateBattery(input.battery);
 if(!Number.isFinite(input.loadedMeters)||input.loadedMeters<0||
    !Number.isFinite(input.emptyMeters)||input.emptyMeters<0)
  throw new RangeError('Cycle distances must be finite and >= 0');
 const start=input.startEnergyWh??input.battery.capacityWh;
 if(!Number.isFinite(start)||start<0||start>input.battery.capacityWh)
  throw new RangeError('startEnergyWh must be within battery capacity');
 const consumptionWh=(input.loadedMeters+input.emptyMeters)*input.battery.whPerMeter;
 const reserveWh=input.battery.capacityWh*input.battery.minSoc;
 const energyAfterWh=start-consumptionWh;
 return {
  startEnergyWh:start,consumptionWh,reserveWh,energyAfterWh,
  socAfter:energyAfterWh/input.battery.capacityWh,
  feasible:energyAfterWh>=reserveWh,
 };
}
export function chargeDurationSeconds(input:{fromWh:number;toWh:number;chargeW:number}):number{
 const {fromWh,toWh,chargeW}=input;
 if(!Number.isFinite(fromWh)||!Number.isFinite(toWh)||fromWh<0||toWh<0||toWh<fromWh)
  throw new RangeError('Charge energy bounds must be finite, nonnegative and ordered');
 if(!Number.isFinite(chargeW)||chargeW<=0)throw new RangeError('chargeW must be finite and > 0');
 return (toWh-fromWh)/chargeW*3600;
}
