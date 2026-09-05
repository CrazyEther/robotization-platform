import { describe,it,expect } from 'vitest';
import app from '../apps/api/app';
const post=(path:string,body:unknown)=>app.request(`/api/v1/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
describe('public API rejects insufficient inputs and unsafe access',()=>{
 it('reports live health without claiming economic readiness',async()=>{const response=await app.request('/api/v1/health');expect(response.status).toBe(200);expect((await response.json()).dataMode).toBe('source-backed-reference-catalog');expect(response.headers.get('x-content-type-options')).toBe('nosniff');});
 it('does not pretend accounts are available without backend configuration',async()=>{const response=await app.request('/api/v1/organizations');expect(response.status).toBe(503);expect((await response.json()).code).toBe('AUTH_NOT_CONFIGURED');});
 it('requires bearer authentication when backend exists',async()=>{const response=await app.request('/api/v1/organizations',{}, {SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'not-a-credential'});expect(response.status).toBe(401);});
 it('rejects malformed JSON diagnosis',async()=>{const response=await app.request('/api/v1/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});expect(response.status).toBe(422);});
 it('never computes missing economics',async()=>{const response=await post('economics',{});expect((await response.json()).status).not.toBe('complete');});
 it('does not invent simulation events',async()=>{const response=await post('simulation/flow',{});expect((await response.json()).status).not.toBe('complete');});
 it('rejects empty provenance imports',async()=>{expect((await post('imports/validate',{})).status).toBe(422);});
 it('rejects unknown products in comparison',async()=>{expect((await post('compare',{productIds:['unknown-a','unknown-b']})).status).toBe(422);});
 it('rejects cross-origin writes',async()=>{const response=await app.request('/api/v1/economics',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'});expect(response.status).toBe(403);});
 it('limits oversized payloads',async()=>{const response=await app.request('/api/v1/economics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:'x'.repeat(2*1024*1024)})});expect(response.status).toBe(413);});
 it('exposes sixteen process templates',async()=>{const response=await app.request('/api/v1/process-templates');expect((await response.json()).families).toHaveLength(16);});
});
