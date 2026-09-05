import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogSchema,families} from '../packages/catalog';
import {buildKnowledgeGraph} from '../packages/catalog/knowledge';
const catalog=catalogSchema.parse(JSON.parse(readFileSync('data/catalog.json','utf8')));
const errors:string[]=[];let verifiedRaw=0;const sources=new Map(catalog.sources.map(s=>[s.id,s]));
if(sources.size!==catalog.sources.length)errors.push('Duplicate source IDs');
if(new Set(catalog.products.map(p=>p.id)).size!==catalog.products.length)errors.push('Duplicate product IDs');
for(const p of catalog.products){if(!families.some(f=>f.id===p.familyId))errors.push('Unknown process: '+p.id);for(const ref of [...p.sourceIds,...p.characteristics.map(c=>c.sourceId)])if(!sources.has(ref))errors.push('Missing source: '+p.id+':'+ref);if(p.readiness.economics||p.readiness.simulation||p.readiness.procurement)errors.push('Unqualified readiness: '+p.id);}
for(const s of catalog.sources){if(s.retrievalStatus==='retrieved'&&(!s.rawLocator||!s.sha256))errors.push('Missing raw provenance: '+s.id);if(s.rawLocator&&existsSync(s.rawLocator)){if(createHash('sha256').update(readFileSync(s.rawLocator)).digest('hex')!==s.sha256)errors.push('Checksum mismatch: '+s.id);else verifiedRaw++;}else if(process.argv.includes('--require-raw')&&s.retrievalStatus==='retrieved')errors.push('Missing local snapshot: '+s.id);}
for(const c of catalog.cases)for(const ref of c.sourceIds)if(!sources.has(ref))errors.push('Case missing source: '+c.id);
const graph=buildKnowledgeGraph(catalog);const nodeIds=new Set(graph.nodes.map(n=>n.id));for(const edge of graph.edges)if(!nodeIds.has(edge.from)||!nodeIds.has(edge.to))errors.push('Dangling graph edge');
if(process.argv.includes('--write-graph'))writeFileSync('data/knowledge-graph.json',JSON.stringify(graph,null,2)+'\n');
console.log(JSON.stringify({status:errors.length?'failed':'passed',products:catalog.products.length,families:families.length,cases:catalog.cases.length,sources:catalog.sources.length,verifiedRaw,graphNodes:graph.nodes.length,graphEdges:graph.edges.length,errors},null,2));if(errors.length)process.exitCode=1;
