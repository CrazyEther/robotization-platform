import { Hono, type Context, type Next } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import registry from '../../data/catalog.json';
import { catalogSchema, compareProducts, diagnose, families, goals, objectTypes } from '../../packages/catalog/index';
import { validateImport } from '../../packages/importer/index';
import * as domain from '../../packages/domain/index';
import {assessCandidates} from '../../packages/catalog/matching';
import {buildKnowledgeGraph} from '../../packages/catalog/knowledge';
import {AnyLogicCloud,cloudRequestSchema} from '../../packages/ris/cloud';

export type Bindings = { SUPABASE_URL?:string; SUPABASE_ANON_KEY?:string; GOOGLE_OAUTH_ENABLED?:string; PUBLIC_PREVIEW_MODE?:string; ANYLOGIC_API_KEY?:string;ANYLOGIC_MODEL_ID?:string;ANYLOGIC_VERSION_ID?:string;ANYLOGIC_CLOUD_ORIGIN?:string;ANYLOGIC_WORKSPACE_TOKEN?:string; ASSETS?:{fetch:(request:Request)=>Promise<Response>} };
type Variables = { db:SupabaseClient; userId:string };
const uuid=z.string().uuid();
const scenario=z.object({name:z.string().trim().min(1).max(200),payload:z.record(z.string(),z.unknown())}).strict();
const invitation=z.object({email:z.string().email().max(254),role:z.enum(['editor','viewer'])}).strict();
const app=new Hono<{Bindings:Bindings;Variables:Variables}>();
app.use('*',secureHeaders({referrerPolicy:'no-referrer',xFrameOptions:'DENY',contentSecurityPolicy:{defaultSrc:["'self'"],scriptSrc:["'self'","'wasm-unsafe-eval'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:'],connectSrc:["'self'",'https://*.supabase.co'],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}}));
app.use('/api/*',bodyLimit({maxSize:2*1024*1024,onError:c=>c.json({error:'Размер запроса превышает 2 МБ'},413)}));
app.use('/api/*',async(c,next)=>{c.header('Cache-Control','no-store');const origin=c.req.header('Origin');const target=new URL(c.req.url);const local=['127.0.0.1','localhost'].includes(target.hostname)&&['http://127.0.0.1:5173','http://localhost:5173'].includes(origin??'');if(origin&&origin!==target.origin&&!local)return c.json({error:'Origin не разрешён'},403);await next();});
app.use('/api/*',async(c,next)=>{if(c.env?.PUBLIC_PREVIEW_MODE==='true'){const allowed=c.req.method==='GET'&&['/api/v1/health','/api/v1/config','/api/v1/catalog'].includes(c.req.path);if(!allowed)return c.json({error:'Публичный предпросмотр: доступно только чтение справочного каталога. Симуляция, финансы и учётные записи пока не подключены.',code:'PREVIEW_READ_ONLY'},503);}await next();});
app.onError((_error,c)=>c.json({error:'Не удалось выполнить запрос'},500));
const json=async(request:Request):Promise<unknown>=>{try{return await request.json();}catch{return null;}};
const unavailable={error:'Кабинеты ещё не подключены: необходима настройка Supabase и Google OAuth',code:'AUTH_NOT_CONFIGURED'};
app.get('/api/v1/health',c=>c.json({status:'ok',version:'1',dataMode:'source-backed-reference-catalog'}));
app.get('/api/v1/config',c=>c.json({publicPreview:c.env?.PUBLIC_PREVIEW_MODE==='true',auth:{configured:Boolean(c.env?.SUPABASE_URL&&c.env?.SUPABASE_ANON_KEY),googleConfigured:c.env?.GOOGLE_OAUTH_ENABLED==='true',supabaseUrl:c.env?.SUPABASE_URL??null,anonKey:c.env?.SUPABASE_ANON_KEY??null}}));
app.get('/api/v1/ris/cloud/status',c=>{
 const env=c.env??{};
 const configured=Boolean(env.ANYLOGIC_API_KEY&&env.ANYLOGIC_MODEL_ID&&env.ANYLOGIC_VERSION_ID&&env.ANYLOGIC_WORKSPACE_TOKEN);
 return c.json({configured,engine:'AnyLogic Cloud REST 8.5.0',modelId:configured?env.ANYLOGIC_MODEL_ID:null,versionId:configured?env.ANYLOGIC_VERSION_ID:null,
  note:configured?'Параметры подключения заполнены. Для подтверждения требуется проверить опубликованную модель RIS.':'AnyLogic Cloud не подключён: требуется API-ключ, идентификаторы модели/версии и ключ локального рабочего пространства.'});
});
const cloudAccess=(c:Context<{Bindings:Bindings;Variables:Variables}>)=>{
 const env=c.env??{};
 if(!env.ANYLOGIC_API_KEY||!env.ANYLOGIC_MODEL_ID||!env.ANYLOGIC_VERSION_ID||!env.ANYLOGIC_WORKSPACE_TOKEN)return {error:'AnyLogic Cloud не настроен',status:503 as const};
 if(!['localhost','127.0.0.1'].includes(new URL(c.req.url).hostname))return {error:'Облачные вычисления доступны только на локальном рабочем месте до внедрения полноценной авторизации',status:403 as const};
 if(c.req.header('x-ris-workspace-key')!==env.ANYLOGIC_WORKSPACE_TOKEN)return {error:'Неверный ключ рабочего пространства',status:403 as const};
 return new AnyLogicCloud({apiKey:env.ANYLOGIC_API_KEY,modelId:env.ANYLOGIC_MODEL_ID,versionId:env.ANYLOGIC_VERSION_ID,origin:env.ANYLOGIC_CLOUD_ORIGIN??'https://cloud.anylogic.com'});
};
app.post('/api/v1/ris/cloud/inspect',async c=>{
 try{
  const access=cloudAccess(c);
  if('status' in access)return c.json({error:access.error},access.status);
  const version=await access.inspect();
  return c.json({connected:true,engine:'AnyLogic Cloud',modelVersion:version.version,versionId:version.id,
   inputs:version.experimentTemplate.inputs.map(x=>({name:x.name,type:x.type})),outputs:version.experimentTemplate.outputs.map(x=>({name:x.name,type:x.type}))});
 }catch{return c.json({error:'Нет доступа к нужной модели AnyLogic Cloud или её входы/выходы несовместимы с RIS.',code:'ANYLOGIC_INSPECTION_FAILED'},502);}
});
app.post('/api/v1/ris/cloud/run',async c=>{
 const parsed=cloudRequestSchema.safeParse(await json(c.req.raw));
 if(!parsed.success)return c.json({error:'Некорректная геометрия, модель робота или параметры сценария',details:parsed.error.issues},422);
 try{
  const access=cloudAccess(c);
  if('status' in access)return c.json({error:access.error},access.status);
  const result=await access.run(parsed.data);
  return c.json(result);
 }catch{return c.json({error:'AnyLogic Cloud не вернул завершённые проверяемые результаты RIS: проверьте публикацию модели, входы, выходы и права аккаунта. ROI недоступен.',code:'ANYLOGIC_RUN_UNVERIFIED'},502);}
});
app.get('/api/v1/catalog',c=>c.json(catalogSchema.parse(registry)));
app.get('/api/v1/process-templates',c=>c.json({families,goals,objectTypes}));
app.get('/api/v1/knowledge-graph',c=>c.json(buildKnowledgeGraph(catalogSchema.parse(registry))));
app.post('/api/v1/assessments',async c=>{const result=assessCandidates(catalogSchema.parse(registry).products,await json(c.req.raw));return c.json(result,result.status==='invalid'?422:200);});
app.post('/api/v1/diagnose',async c=>{const result=diagnose(await json(c.req.raw));return c.json(result,result.status==='invalid'?422:200);});
app.post('/api/v1/compare',async c=>{const parsed=z.object({productIds:z.array(z.string()).min(2).max(4).refine(x=>new Set(x).size===x.length)}).strict().safeParse(await json(c.req.raw));if(!parsed.success)return c.json({error:'Укажите от 2 до 4 разных продуктов'},422);const products=catalogSchema.parse(registry).products.filter(p=>parsed.data.productIds.includes(p.id));if(products.length!==parsed.data.productIds.length)return c.json({error:'Неизвестный продукт'},422);return c.json({products,rows:compareProducts(products)});});
app.post('/api/v1/economics',async c=>c.json(domain.evaluateEconomics(await json(c.req.raw))));
app.post('/api/v1/models',async c=>c.json(domain.evaluateModel(await json(c.req.raw))));
app.post('/api/v1/simulation/replay',async c=>c.json(domain.replaySimulation(await json(c.req.raw))));
app.post('/api/v1/simulation/flow',async c=>c.json(domain.simulateFlow(await json(c.req.raw))));
app.post('/api/v1/imports/validate',async c=>{const result=validateImport(await json(c.req.raw));return c.json(result,result.valid?200:422);});

app.use('/api/v1/organizations/*',authenticate);
app.use('/api/v1/organizations',authenticate);
app.use('/api/v1/me',authenticate);
app.use('/api/v1/invitations/*',authenticate);
async function authenticate(c:Context<{Bindings:Bindings;Variables:Variables}>,next:Next){
 const url=c.env?.SUPABASE_URL,key=c.env?.SUPABASE_ANON_KEY;if(!url||!key)return c.json(unavailable,503);
 const authorization=c.req.header('Authorization');if(!authorization?.startsWith('Bearer ')||authorization.length>12000)return c.json({error:'Требуется вход'},401);
 const db=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(authorization.slice(7));if(error||!data.user)return c.json({error:'Сессия недействительна'},401);
 c.set('db',db);c.set('userId',data.user.id);await next();
}
app.get('/api/v1/me',c=>c.json({id:c.get('userId')}));
app.get('/api/v1/organizations',async c=>{const {data,error}=await c.get('db').from('organizations').select('id,name,created_at,organization_members(role,user_id)');if(error)return c.json({error:'Не удалось получить организации'},502);return c.json({organizations:data});});
app.post('/api/v1/organizations',async c=>{const input=z.object({name:z.string().trim().min(1).max(200)}).strict().safeParse(await json(c.req.raw));if(!input.success)return c.json({error:'Укажите название организации'},422);const {data,error}=await c.get('db').rpc('create_organization',{p_name:input.data.name});if(error)return c.json({error:'Не удалось создать организацию'},400);return c.json({organization:data},201);});
app.use('/api/v1/organizations/:orgId/*',async(c,next)=>{if(!uuid.safeParse(c.req.param('orgId')).success)return c.json({error:'Неверный идентификатор организации'},422);await next();});
app.get('/api/v1/organizations/:orgId/scenarios',async c=>{const {data,error}=await c.get('db').from('scenarios').select('*').eq('organization_id',c.req.param('orgId')).order('updated_at',{ascending:false});if(error)return c.json({error:'Не удалось прочитать сценарии'},400);return c.json({scenarios:data});});
app.post('/api/v1/organizations/:orgId/scenarios',async c=>{const input=scenario.safeParse(await json(c.req.raw));if(!input.success)return c.json({error:'Неверный сценарий'},422);const {data,error}=await c.get('db').rpc('save_scenario',{p_org:c.req.param('orgId'),p_id:null,p_name:input.data.name,p_payload:input.data.payload,p_expected_version:null});if(error)return c.json({error:'Нет доступа или сценарий отклонён'},403);return c.json({scenario:data},201);});
app.put('/api/v1/organizations/:orgId/scenarios/:id',async c=>{const input=scenario.extend({expectedVersion:z.number().int().positive()}).safeParse(await json(c.req.raw));if(!input.success||!uuid.safeParse(c.req.param('id')).success)return c.json({error:'Неверный сценарий или версия'},422);const {data,error}=await c.get('db').rpc('save_scenario',{p_org:c.req.param('orgId'),p_id:c.req.param('id'),p_name:input.data.name,p_payload:input.data.payload,p_expected_version:input.data.expectedVersion});if(error)return c.json({error:'Нет доступа либо версия изменилась. Обновите сценарий.'},409);return c.json({scenario:data});});
app.get('/api/v1/organizations/:orgId/scenarios/:id/history',async c=>{if(!uuid.safeParse(c.req.param('id')).success)return c.json({error:'Неверный идентификатор'},422);const {data,error}=await c.get('db').from('scenario_versions').select('*').eq('organization_id',c.req.param('orgId')).eq('scenario_id',c.req.param('id')).order('version',{ascending:false});if(error)return c.json({error:'Не удалось прочитать историю'},400);return c.json({history:data});});
app.get('/api/v1/organizations/:orgId/scenarios/:id/export',async c=>{if(!uuid.safeParse(c.req.param('id')).success)return c.json({error:'Неверный идентификатор'},422);const {data,error}=await c.get('db').from('scenarios').select('*').eq('organization_id',c.req.param('orgId')).eq('id',c.req.param('id')).single();if(error||!data)return c.json({error:'Сценарий не найден'},404);c.header('Content-Disposition',`attachment; filename="scenario-${c.req.param('id')}.json"`);return c.json({schemaVersion:'1',exportedAt:new Date().toISOString(),scenario:data});});
app.post('/api/v1/organizations/:orgId/invitations',async c=>{const input=invitation.safeParse(await json(c.req.raw));if(!input.success)return c.json({error:'Неверное приглашение'},422);const {data,error}=await c.get('db').rpc('create_invitation',{p_org:c.req.param('orgId'),p_email:input.data.email,p_role:input.data.role});if(error)return c.json({error:'Приглашать участников может владелец'},403);return c.json({invitation:data,note:'Передайте ссылку адресату самостоятельно. Письмо не отправлено.'},201);});
app.post('/api/v1/invitations/accept',async c=>{const input=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict().safeParse(await json(c.req.raw));if(!input.success)return c.json({error:'Неверный токен приглашения'},422);const {data,error}=await c.get('db').rpc('accept_invitation',{p_token:input.data.token});if(error)return c.json({error:'Приглашение недействительно, истекло или предназначено другому адресу'},403);return c.json({organizationId:data});});
app.post('/api/v1/organizations/:orgId/imports',async c=>{const result=validateImport(await json(c.req.raw));if(!result.valid)return c.json(result,422);const {data,error}=await c.get('db').rpc('stage_catalog_import',{p_org:c.req.param('orgId'),p_payload:result.data});if(error)return c.json({error:'Импорт отклонён или недостаточно прав'},403);return c.json({staging:data},201);});
app.post('/api/v1/organizations/:orgId/imports/:id/publish',async c=>{if(!uuid.safeParse(c.req.param('id')).success)return c.json({error:'Неверный идентификатор'},422);const {data,error}=await c.get('db').rpc('publish_catalog_import',{p_org:c.req.param('orgId'),p_id:c.req.param('id')});if(error)return c.json({error:'Публикация отклонена или недостаточно прав'},403);return c.json({publication:data});});
app.get('/api/v1/organizations/:orgId/catalog',async c=>{const {data,error}=await c.get('db').from('catalog_publications').select('id,created_at,payload').eq('organization_id',c.req.param('orgId')).order('created_at',{ascending:false});if(error)return c.json({error:'Не удалось прочитать каталог'},400);return c.json({publications:data});});
app.all('/api/*',c=>c.json({error:'Маршрут не найден'},404));
app.get('*',async c=>{if(!c.env?.ASSETS)return c.text('Интерфейс: npm run dev или npm run build',404);const response=await c.env.ASSETS.fetch(c.req.raw);if(c.env.PUBLIC_PREVIEW_MODE!=='true')return new Response(response.body,response);const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow, noarchive');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});});
export default app;
