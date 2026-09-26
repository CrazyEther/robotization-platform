import {z} from 'zod';

const id=z.string().trim().min(1).max(128);
const finite=z.number().finite();
const positive=finite.positive();
const sourceSchema=z.object({
 type:z.enum(['template','manual','json','image','pdf','cad','imported']),
 name:z.string().trim().min(1).max(255).nullable(),
 geometryStatus:z.enum(['template','reference','validated','traced']),
 dimensionsConfirmed:z.boolean(),siteSpecific:z.boolean(),
}).strict();
export const geometrySchema=z.object({
 x:finite.min(0).max(100000),y:finite.min(0).max(100000),
 w:positive.max(100000),h:positive.max(100000),rotationDeg:finite.min(-360).max(360).default(0),
}).strict();
export const facilityObjectSchema=z.object({
 id,label:z.string().trim().min(1).max(200),
 kind:z.enum(['wall','obstacle','rack','station','charger','door','lift','zone','machine','buffer','conveyor']),
 geometry:geometrySchema,
 blocking:z.boolean().default(false),
 capacity:z.number().int().min(0).max(100000).default(0),
 properties:z.record(z.string(),z.union([z.string(),finite,z.boolean()])).default({}),
}).strict();
export const floorSchema=z.object({
 id,label:z.string().trim().min(1).max(200),zMeters:finite,
 widthMeters:positive.max(100000),heightMeters:positive.max(100000),
 objects:z.array(facilityObjectSchema).max(20000),
}).strict();
export const facilitySchema=z.object({
 schemaVersion:z.literal('ris-facility/2'),id,name:z.string().trim().min(1).max(200),
 unit:z.literal('m'),source:sourceSchema,
 floors:z.array(floorSchema).min(1).max(100),
}).strict();
export const processNodeSchema=z.object({
 id,label:z.string().trim().min(1).max(200),
 kind:z.enum(['source','transport','process','buffer','sink','inspection','assembly','decision']),
 facilityObjectId:id.optional(),durationSeconds:finite.min(0).optional(),
 properties:z.record(z.string(),z.union([z.string(),finite,z.boolean()])).default({}),
}).strict();
export const processSchema=z.object({
 schemaVersion:z.literal('ris-process/1'),id,name:z.string().trim().min(1).max(200),
 entityType:z.string().trim().min(1).max(120),
 nodes:z.array(processNodeSchema).min(2).max(10000),
 edges:z.array(z.object({
  id,from:id,to:id,mode:z.enum(['flow','transport']).default('flow'),
 }).strict()).min(1).max(20000),
}).strict();
export const robotSpecSchema=z.object({
 id,label:z.string().trim().min(1).max(200),fleetSize:z.number().int().min(1).max(10000),
 capacity:z.object({payloadKg:positive.max(100000)}).strict(),
 kinematics:z.object({
  maxSpeedMps:positive.max(30),accelerationMps2:positive.max(20).default(1),
  decelerationMps2:positive.max(20).default(1),turnRadiusM:finite.min(0).max(100).default(0),
 }).strict(),
 dimensions:z.object({lengthM:positive.max(20),widthM:positive.max(20),heightM:positive.max(20)}).strict(),
 battery:z.object({
  capacityWh:positive.max(10000000),chargeW:positive.max(1000000),
  whPerMeter:positive.max(5000),minSoc:z.number().min(0).max(1).default(.15),
 }).strict(),
 handling:z.object({loadSeconds:finite.min(0).max(86400),unloadSeconds:finite.min(0).max(86400)}).strict(),
 navigationType:z.enum(['path-guided','free-space']).default('free-space'),
}).strict();
export const workloadSchema=z.object({
 demandPerHour:positive.max(1000000),unitLoadKg:positive.max(100000),
 shiftHours:positive.max(168),arrivalProcess:z.enum(['fixed','poisson']),
 seed:z.number().int().min(1).max(2147483647),
}).strict();
export const simulationScenarioSchema=z.object({
 schemaVersion:z.literal('ris-simulation-scenario/2'),
 id,name:z.string().trim().min(1).max(200),
 profile:z.string().trim().min(1).max(120).optional(),
 facility:facilitySchema,process:processSchema,
 robots:z.array(robotSpecSchema).min(1).max(1000),
 workload:workloadSchema,
 scenarioHash:z.string().regex(/^fnv1a64:[0-9a-f]{16}$/).optional(),
}).strict();
export type FacilityModel=z.infer<typeof facilitySchema>;
export type ProcessModel=z.infer<typeof processSchema>;
export type RobotSpec=z.infer<typeof robotSpecSchema>;
export type SimulationScenarioV2=z.infer<typeof simulationScenarioSchema> & {scenarioHash:string};
