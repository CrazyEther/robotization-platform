import { describe,it,expect } from 'vitest';
import { compareProducts,diagnose,families } from '../packages/catalog/index';
import { validateImport } from '../packages/importer/index';
describe('honest boundaries',()=>{
 it('rejects empty imports',()=>expect(validateImport({}).valid).toBe(false));
 it('does not invent comparison rows',()=>expect(compareProducts([])).toEqual([]));
 it('rejects invalid diagnosis',()=>expect(diagnose({}).status).toBe('invalid'));
 it('covers all distinct process templates',()=>expect(new Set(families.map(f=>f.id)).size).toBe(16));
});
