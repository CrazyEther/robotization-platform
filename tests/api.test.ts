import { describe,it,expect } from 'vitest';
import app from '../apps/api/app';
import {createScenario} from '../packages/ris/contracts';
const post=(path:string,body:unknown)=>app.request(`/api/v1/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
describe('public API rejects insufficient inputs and unsafe access',()=>{
 it('preview static pages are not indexed as a production product',async()=>{
  const response=await app.request('/',{},{PUBLIC_PREVIEW_MODE:'true',ASSETS:{fetch:async()=>new Response('<h1>Preview</h1>',{headers:{'content-type':'text/html'}})}});
  expect(response.status).toBe(200);
  expect(response.headers.get('x-robots-tag')).toMatch(/noindex/);
 });
 it('preview exposes only informational GET endpoints and blocks compute, account and write APIs',async()=>{
  const env={PUBLIC_PREVIEW_MODE:'true'};
  for(const path of ['/api/v1/health','/api/v1/config','/api/v1/catalog']){
   const response=await app.request(path,{},env);expect(response.status).toBe(200);
   expect(response.headers.get('cache-control')).toBe('no-store');
  }
  const config=await app.request('/api/v1/config',{},env);
  expect((await config.json()).publicPreview).toBe(true);
  for(const [path,method] of [['/api/v1/ris/cloud/run','POST'],['/api/v1/economics','POST'],['/api/v1/organizations','GET'],['/api/v1/organizations','POST'],['/api/v1/diagnose','POST'],['/api/v1/knowledge-graph','GET']]){
   const response=await app.request(path,{method},env);expect(response.status,path).toBe(503);
   expect((await response.json()).code).toBe('PREVIEW_READ_ONLY');
  }
  const response=await app.request('/api/v1/catalog',{method:'POST'},env);
  expect(response.status).toBe(503);
 });
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

describe('AnyLogic Cloud local-only compute boundary',()=>{
 const env={ANYLOGIC_API_KEY:'secret-key-that-must-never-leak',ANYLOGIC_MODEL_ID:'model-1',ANYLOGIC_VERSION_ID:'version-1',ANYLOGIC_WORKSPACE_TOKEN:'local-strong-password'};
 it('fails closed without configured Cloud credentials',async()=>{
  const res=await app.request('/api/v1/ris/cloud/status',{});
  expect(res.status).toBe(200);
  const body=await res.json() as Record<string,unknown>;
  expect(body.configured).toBe(false);
  expect(JSON.stringify(body)).not.toContain('secret-key');
  const run=await app.request('/api/v1/ris/cloud/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scenario:createScenario('hospital'),robotId:'mir-250'})});
  expect(run.status).toBe(503);
 });
 it('only permits local machine with a workspace token and never returns Cloud key',async()=>{
  const status=await app.request('/api/v1/ris/cloud/status',{},env);
  expect(status.status).toBe(200);
  expect((await status.json() as {configured:boolean}).configured).toBe(true);
  const missing=await app.request('/api/v1/ris/cloud/inspect',{method:'POST'},env);
  expect(missing.status).toBe(403);
  const remote=await app.request('https://ris.example.com/api/v1/ris/cloud/inspect',{method:'POST',headers:{'x-ris-workspace-key':env.ANYLOGIC_WORKSPACE_TOKEN}},env);
  expect(remote.status).toBe(403);
 });
 it('preview blocks even the configured local Cloud connector',async()=>{
  const res=await app.request('/api/v1/ris/cloud/run',{method:'POST',headers:{'x-ris-workspace-key':env.ANYLOGIC_WORKSPACE_TOKEN}}, {...env,PUBLIC_PREVIEW_MODE:'true'});
  expect(res.status).toBe(503);
  expect((await res.json() as {code:string}).code).toBe('PREVIEW_READ_ONLY');
 });
});
