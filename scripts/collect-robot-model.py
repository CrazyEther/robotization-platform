"""Collect the manufacturer-published EFEU ROS2 model with its MIT license.

Run with xacro available in Python. No movements or facility layout are generated.
"""
import datetime,hashlib,json,re,sys,urllib.request
from pathlib import Path

repository='SEW-Eurodrive-Open-Source/Multimodal_AMR_dataset'
commit=json.load(urllib.request.urlopen(f'https://api.github.com/repos/{repository}/commits/main'))['sha']
tree=json.load(urllib.request.urlopen(f'https://api.github.com/repos/{repository}/git/trees/{commit}?recursive=1'))
prefix='dataset_rosbag_viewer/ros2/urdf_viewer/'
target=Path('public/models/efeu');target.mkdir(parents=True,exist_ok=True)
previous=json.loads((target/'provenance.json').read_text(encoding='utf-8')) if (target/'provenance.json').exists() else {}
records=[]
for item in tree['tree']:
 path=item['path']
 if item['type']!='blob' or not path.startswith(prefix):continue
 relative=path[len(prefix):]
 if not (relative=='LICENSE' or relative.startswith('urdf/') or relative.startswith('meshes/')):continue
 if item.get('size',0)>16_000_000:raise RuntimeError('Unexpected asset size')
 url=f'https://raw.githubusercontent.com/{repository}/{commit}/{path}'
 destination=target/relative
 cached=destination.read_bytes() if destination.exists() else b''
 if cached and hashlib.sha1(b'blob '+str(len(cached)).encode()+b'\0'+cached).hexdigest()==item['sha']:data=cached
 else:
  with urllib.request.urlopen(url,timeout=45) as response:data=response.read(16_000_001)
 if len(data)>16_000_000:raise RuntimeError('Asset size exceeds limit')
 destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
 records.append({'path':relative,'url':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
if 'MIT License' not in (target/'LICENSE').read_text(encoding='utf-8'):raise RuntimeError('Expected package license not found')
if Path('.tools/xacro').exists():sys.path.insert(0,str(Path('.tools/xacro').resolve()))
import xacro
# Expand only authored macros. Package discovery is replaced by the collected package path.
working=Path('.tools/efeu-xacro');working.mkdir(parents=True,exist_ok=True)
for source in target.rglob('*.xacro'):
 relative=source.relative_to(target);destination=working/relative;destination.parent.mkdir(parents=True,exist_ok=True)
 text=source.read_text(encoding='utf-8')
 text=text.replace('$(find urdf_viewer)',working.resolve().as_posix())
 text=text.replace('$(find-pkg-share urdf_viewer)',working.resolve().as_posix())
 if re.search(r'__import__|subprocess|os\.system',text):raise RuntimeError('Unexpected executable expression')
 destination.write_text(text,encoding='utf-8')
document=xacro.process_file(str(working/'urdf/AMR/efeu.xacro'))
output=re.sub(r'<!--.*?-->','',document.toxml(),flags=re.S).replace('package://urdf_viewer/','')
(target/'efeu.urdf').write_text(output,encoding='utf-8')
manifest={'name':'EFEU mobile platform','publisher':'SEW-EURODRIVE','source':f'https://github.com/{repository}/tree/{commit}/{prefix}','commit':commit,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'license':'MIT','attribution':'Copyright (c) 2025 SEW-EURODRIVE, Authors: Yannick Wunderle, Leon Schönfeld','mappingVersion':'xacro-to-urdf-1','changes':'Expanded authored xacro macros and rewrote package URIs to local asset URLs. No facility layout or motion generated.','derivedSha256':hashlib.sha256(output.encode()).hexdigest(),'files':records}
if previous.get('webModel',{}).get('sourceUrdfSha256')==manifest['derivedSha256']:manifest['webModel']=previous['webModel']
(target/'provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(records),'bytes':sum(r['bytes'] for r in records),'commit':commit,'output':str(target/'efeu.urdf')}))
