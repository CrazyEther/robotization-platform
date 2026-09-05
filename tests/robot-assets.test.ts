import {it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
it('keeps the licensed manufacturer model complete with relative mesh references and checksums',()=>{
 const root=resolve('public/models/efeu');const xml=readFileSync(resolve(root,'efeu.urdf'),'utf8');
 const manifest=JSON.parse(readFileSync(resolve(root,'provenance.json'),'utf8')) as {derivedSha256:string;webModel:{path:string;sha256:string;sourceUrdfSha256:string};files:Array<{path:string;sha256:string}>};
 expect(createHash('sha256').update(xml).digest('hex')).toBe(manifest.derivedSha256);
 expect(manifest.webModel.sourceUrdfSha256).toBe(manifest.derivedSha256);
 expect(createHash('sha256').update(readFileSync(resolve(root,manifest.webModel.path))).digest('hex')).toBe(manifest.webModel.sha256);
 expect(readFileSync(resolve(root,'LICENSE'),'utf8')).toContain('MIT License');
 const meshes=[...xml.matchAll(/<mesh\s+[^>]*filename="([^"]+)"/g)];expect(meshes.length).toBeGreaterThan(0);
 for(const [,name] of meshes){expect(name.startsWith('/')).toBe(false);const path=resolve(root,name);expect(path.startsWith(root+sep)).toBe(true);expect(existsSync(path)).toBe(true);}
 for(const entry of manifest.files)expect(createHash('sha256').update(readFileSync(resolve(root,entry.path))).digest('hex')).toBe(entry.sha256);
});
