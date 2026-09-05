import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {observedPosition,spatialSchema,type SpatialScene} from '../../packages/domain/spatial';
import {Pause,Play,RotateCcw,Upload,Box} from 'lucide-react';
import {number,download} from './utils';
import './spatial.css';
const RobotModelViewer=lazy(()=>import('./RobotModelViewer'));

const colors={rack:0x9b7654,conveyor:0x5c7b81,wall:0xc5ccc8,station:0x367e66,zone:0xa9bfbc};
function SceneCanvas({scene,time}:{scene:SpatialScene;time:number}){
 const host=useRef<HTMLDivElement>(null),timeRef=useRef(time);timeRef.current=time;
 const [failure,setFailure]=useState('');
 useEffect(()=>{
  if(!host.current)return;const element=host.current;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setFailure('Браузер не предоставил WebGL. Данные и экспорт доступны ниже.');return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor(0xe8eeea);renderer.shadowMap.enabled=true;
  renderer.domElement.setAttribute('aria-label','Трёхмерная сцена объекта');renderer.domElement.setAttribute('role','img');element.appendChild(renderer.domElement);
  const world=new THREE.Scene();const min=new THREE.Vector3(...scene.bounds.min),max=new THREE.Vector3(...scene.bounds.max),size=max.clone().sub(min),center=min.clone().add(max).multiplyScalar(.5),extent=Math.max(size.x,size.y,size.z);
  const camera=new THREE.PerspectiveCamera(42,1,Math.max(extent/10000,.001),extent*20);camera.position.copy(center).add(new THREE.Vector3(extent,.8*extent,extent));
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(center);controls.enableDamping=true;controls.minDistance=extent/100;controls.maxDistance=extent*5;
  world.add(new THREE.HemisphereLight(0xffffff,0x587164,2.4));const light=new THREE.DirectionalLight(0xffffff,3);light.position.copy(center).add(new THREE.Vector3(extent,extent*2,extent*.5));world.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(size.x,size.z),new THREE.MeshStandardMaterial({color:0xdce5df,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(center.x,min.y,center.z);world.add(floor);
  const frame=new THREE.Box3Helper(new THREE.Box3(min,max),0x81998e);world.add(frame);
  const meshes=new Map<string,THREE.Mesh>();
  for(const o of scene.objects){const material=new THREE.MeshStandardMaterial({color:colors[o.kind],roughness:.65,transparent:o.kind==='zone',opacity:o.kind==='zone'?.2:.9});const mesh=new THREE.Mesh(new THREE.BoxGeometry(...o.size),material);mesh.position.set(...o.position);world.add(mesh);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x405c4e,transparent:true,opacity:.35}));mesh.add(edges);}
  for(const robot of scene.robots){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...robot.size),new THREE.MeshStandardMaterial({color:0x137c57,metalness:.2,roughness:.4}));world.add(mesh);meshes.set(robot.id,mesh);const path=new THREE.BufferGeometry().setFromPoints(robot.samples.map(s=>new THREE.Vector3(...s.position)));const points=new THREE.Points(path,new THREE.PointsMaterial({color:0x1c8e66,size:3,sizeAttenuation:false}));world.add(points);}
  const resize=()=>{const width=element.clientWidth,height=element.clientHeight;if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(element);resize();let frameId=0;
  const render=()=>{for(const robot of scene.robots){const mesh=meshes.get(robot.id)!;const sample=observedPosition(robot.samples,timeRef.current);mesh.visible=sample!==null;if(sample)mesh.position.set(...sample.position);}controls.update();renderer.render(world,camera);frameId=requestAnimationFrame(render);};render();
  return()=>{cancelAnimationFrame(frameId);observer.disconnect();controls.dispose();world.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments||o instanceof THREE.Points){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();};
 },[scene]);
 return <div className="spatial-canvas" ref={host}>{failure&&<p role="alert">{failure}</p>}</div>;
}
export default function SpatialViewer(){
 const [showRobot,setShowRobot]=useState(false);
 const [scene,setScene]=useState<SpatialScene|null>(null),[error,setError]=useState(''),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1);
 const starts=scene?.robots.map(r=>r.samples[0].at)??[],ends=scene?.robots.map(r=>r.samples.at(-1)!.at)??[];const start=starts.length?Math.min(...starts):0,end=ends.length?Math.max(...ends):0;
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setTime(t=>{if(t+.1*speed>=end){setPlaying(false);return end;}return t+.1*speed;}),100);return()=>clearInterval(timer);},[playing,speed,end]);
 return <section className="panel spatial-panel"><div className="section-head"><div><span className="eyebrow">Пространство и движение</span><h2>Склад в 3D</h2></div><Box size={25}/></div><p>Планировка, габариты оборудования и позиции роботов в одной системе координат. Вращайте сцену мышью или касанием, приближайте колёсиком.</p>
 {!scene&&<><button className="primary" onClick={()=>setShowRobot(!showRobot)}>{showRobot?'Скрыть модель платформы':'Рассмотреть мобильную платформу в 3D'}</button>{showRobot&&<Suspense fallback={<p>Загрузка просмотрщика…</p>}><RobotModelViewer/></Suspense>}</>}{!scene&&<div className="spatial-start"><Box size={44}/><h3>Откройте планировку объекта</h3><p>Загрузите геометрию и координаты из обследования или системы управления роботами. Сцена строится по вашим размерам в метрах.</p></div>}
 <label className="upload"><Upload size={17}/> Загрузить сцену JSON<input type="file" accept="application/json,.json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setPlaying(false);try{if(file.size>10_000_000)throw new Error('Размер сцены не должен превышать 10 МБ');const result=spatialSchema.safeParse(JSON.parse(await file.text()));if(!result.success)throw new Error(result.error.issues.slice(0,5).map(i=>i.path.join('.')+': '+i.message).join('\n'));setScene(result.data);setTime(result.data.robots.length?Math.min(...result.data.robots.map(r=>r.samples[0].at)):0);setError('');}catch(err){setError(err instanceof Error?err.message:'Не удалось прочитать сцену');}e.target.value='';}}/></label>{error&&<p role="alert" className="errors">{error}</p>}
 {scene&&<><SceneCanvas scene={scene} time={time}/><div className="player"><button aria-label={playing?'Остановить движение':'Воспроизвести движение'} disabled={end<=start} onClick={()=>{if(time>=end)setTime(start);setPlaying(!playing);}}>{playing?<Pause size={18}/>:<Play size={18}/>}</button><button aria-label="Сцена в начало" onClick={()=>{setTime(start);setPlaying(false);}}><RotateCcw size={18}/></button><input type="range" aria-label="Время 3D-сцены" min={start} max={end} step="any" value={time} onChange={e=>{setTime(Number(e.target.value));setPlaying(false);}}/><span>{number(time-start)} с</span><select aria-label="Скорость 3D-воспроизведения" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,10,60].map(v=><option key={v} value={v}>{v}×</option>)}</select></div>
 <div className="live-kpis"><div><small>Объектов планировки</small><strong>{scene.objects.length}</strong></div><div><small>Роботов с наблюдением</small><strong>{scene.robots.filter(r=>observedPosition(r.samples,time)).length}</strong></div><div><small>Время от начала записи</small><strong>{number(time-start)} с</strong></div></div><p className="muted">Габаритные модели условные; размеры взяты из файла. Точки показывают измеренные позиции. Между отсчётами отображается последняя наблюдаемая позиция; после конца записи робот скрывается.</p><details><summary>Позиции и источник</summary><p>{scene.name} · {scene.observedAt} · {scene.sourceRef}</p><p>{scene.terms}</p>{scene.robots.map(r=>{const s=observedPosition(r.samples,time);return <p key={r.id}>{r.label}: {s?s.position.map(v=>number(v)).join(' / ')+' м · отсчёт '+number(s.at)+' с':'Нет наблюдения'}</p>;})}</details><button onClick={()=>download('spatial-scene.json',JSON.stringify(scene,null,2))}>Экспорт сцены</button></>}
 <details><summary>Формат сцены</summary><p>schemaVersion: 1; unit: m; timeUnit: s; upAxis: y. Обязательны name, sourceRef, observedAt (ISO 8601), terms и bounds с min/max [x,y,z].</p><p>objects: id, label, kind (rack/conveyor/wall/station/zone), position и size [x,y,z], sourceRef. robots: id, label, size, sourceRef, samples с at (секунды), position и sourceRef. Координаты задают центр габаритной модели; временные отметки строго возрастают. Массивы могут быть пустыми для показа одной планировки.</p></details>
 </section>;
}
