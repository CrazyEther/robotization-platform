import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import type {Layout} from '../../packages/ris/contracts';

type Robot={id:string;x:number;y:number};
export default function Scene3D({layout,robots}:{layout:Layout;robots:Robot[]}){
 const host=useRef<HTMLDivElement>(null),robotMeshes=useRef<Map<string,THREE.Mesh>>(new Map());
 const renderer=useRef<THREE.WebGLRenderer|null>(null);
 useEffect(()=>{
  const el=host.current;if(!el)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x122736);
  const camera=new THREE.PerspectiveCamera(42,1,.1,1000);
  const size=Math.max(layout.width,layout.height);
  camera.position.set(size*.9,size*.8,size*.9);
  camera.lookAt(0,0,0);
  let webgl:THREE.WebGLRenderer;
  try{webgl=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{
   el.textContent='Для просмотра 3D требуется браузер с поддержкой WebGL.';return;
  }
  renderer.current=webgl;(webgl as THREE.WebGLRenderer & {__risScene?:THREE.Scene}).__risScene=scene;webgl.setPixelRatio(Math.min(window.devicePixelRatio,2));
  el.appendChild(webgl.domElement);webgl.domElement.setAttribute('aria-label','3D вид помещения');
  const controls=new OrbitControls(camera,webgl.domElement);
  controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(layout.width,layout.height),new THREE.MeshStandardMaterial({color:0x33495c,roughness:.95}));
  floor.rotation.x=-Math.PI/2;scene.add(floor);
  const grid=new THREE.GridHelper(Math.max(layout.width,layout.height),Math.min(40,size),0x547489,0x314858);
  grid.position.y=.015;scene.add(grid);
  scene.add(new THREE.AmbientLight(0xffffff,1.7));
  const light=new THREE.DirectionalLight(0xffffff,2);
  light.position.set(12,30,8);scene.add(light);
  const toWorld=(x:number,y:number)=>({x:x-layout.width/2,z:y-layout.height/2});
  const blockMat=new THREE.MeshStandardMaterial({color:0x82919d,roughness:.86});
  for(const o of layout.obstacles){
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(o.w,2,o.h),blockMat);
   const {x,z}=toWorld(o.x+o.w/2,o.y+o.h/2);
   mesh.position.set(x,1,z);scene.add(mesh);
  }
  for(const [point,color] of [[layout.pickup,0x448efa],[layout.dropoff,0xff8545]] as const){
   const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,.06,24),new THREE.MeshBasicMaterial({color}));
   const {x,z}=toWorld(point.x+.5,point.y+.5);mesh.position.set(x,.055,z);scene.add(mesh);
  }
  const resize=()=>{const w=Math.max(240,el.clientWidth),h=Math.max(220,el.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();webgl.setSize(w,h);};
  resize();const observer=new ResizeObserver(resize);observer.observe(el);
  const tick=()=>{controls.update();webgl.render(scene,camera);animation=requestAnimationFrame(tick);};
  let animation=requestAnimationFrame(tick);
  robotMeshes.current=new Map();
  const map=robotMeshes.current;
  return ()=>{cancelAnimationFrame(animation);observer.disconnect();controls.dispose();blockMat.dispose();floor.geometry.dispose();(floor.material as THREE.Material).dispose();(grid.material as THREE.Material).dispose();for(const m of map.values()){scene.remove(m);m.geometry.dispose();(m.material as THREE.Material).dispose();}webgl.dispose();webgl.domElement.remove();robotMeshes.current=new Map();renderer.current=null;};
 },[layout]);
 useEffect(()=>{
  const el=host.current,canvas=renderer.current;if(!el||!canvas)return;
  const scene=(canvas as THREE.WebGLRenderer & {__risScene?:THREE.Scene}).__risScene;
  if(!scene)return;
  const alive=new Set(robots.map(robot=>robot.id));
  for(const [id,mesh] of robotMeshes.current){if(!alive.has(id)){scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();robotMeshes.current.delete(id);}}
  for(const robot of robots){
   let mesh=robotMeshes.current.get(robot.id);
   if(!mesh){mesh=new THREE.Mesh(new THREE.BoxGeometry(1.4,.65,1.1),new THREE.MeshStandardMaterial({color:0x69d5cf}));scene.add(mesh);robotMeshes.current.set(robot.id,mesh);}
   mesh.position.set(robot.x-layout.width/2,.38,robot.y-layout.height/2);
  }
 },[robots,layout]);
 return <div ref={host} className="ris-scene-3d" role="img" aria-label="Трёхмерное геометрическое представление помещения и положения роботов"/>;
}
