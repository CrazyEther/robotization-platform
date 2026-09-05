import {describe,it,expect} from 'vitest';
import {spatialSchema,observedPosition} from '../packages/domain/spatial';
describe('Spatial input boundary without fabricated domain scenes',()=>{
 it('requires provenance, dimensions and coordinate system',()=>{expect(spatialSchema.safeParse({}).success).toBe(false);});
 it('does not accept a foreign coordinate system or non-finite values',()=>{expect(spatialSchema.safeParse({unit:'feet',upAxis:'z',bounds:{min:[0,0,0],max:[Infinity,0,0]}}).success).toBe(false);});
 it('never creates a position when observations are missing',()=>{expect(observedPosition([],0)).toBeNull();expect(observedPosition([],Infinity)).toBeNull();});
});
