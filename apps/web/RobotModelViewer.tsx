import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

/** Manufacturer geometry at its authored neutral joint pose; no movement is fabricated. */
export default function RobotModelViewer(){
 const host=useRef<HTMLDivElement>(null);const [status,setStatus]=useState('Загружается модель платформы…');
 useEffect(()=>{
  if(!host.current)return;const element=host.current;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setStatus('WebGL недоступен в этом браузере.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xe6ede7);renderer.domElement.setAttribute('aria-label','Модель мобильной платформы EFEU');renderer.domElement.setAttribute('role','img');element.appendChild(renderer.domElement);
  const world=new THREE.Scene();world.add(new THREE.HemisphereLight(0xffffff,0x4b6154,2.6));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,5,4);world.add(light);
  const camera=new THREE.PerspectiveCamera(38,1,.001,1000);camera.position.set(2,2,2);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  let active=true,frame=0,model:THREE.Object3D|undefined,failed=false;
  const dispose=(root:THREE.Object3D)=>root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});
  const manager=new THREE.LoadingManager();manager.onError=()=>{failed=true;if(active)setStatus('Не удалось загрузить часть геометрии. Обновите страницу.');};
  manager.onLoad=()=>{if(!active){if(model)dispose(model);return;}if(!model||failed)return;model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);if(bounds.isEmpty()){setStatus('Геометрия модели пуста.');return;}const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),extent=Math.max(size.x,size.y,size.z);const radius=bounds.getBoundingSphere(new THREE.Sphere()).radius;const halfVertical=THREE.MathUtils.degToRad(camera.fov)/2;const halfHorizontal=Math.atan(Math.tan(halfVertical)*camera.aspect);const distance=radius/Math.sin(Math.min(halfVertical,halfHorizontal))*1.12;camera.position.copy(center).add(new THREE.Vector3(1,.75,1).normalize().multiplyScalar(distance));camera.far=extent*100;camera.updateProjectionMatrix();controls.target.copy(center);controls.minDistance=extent/5;controls.maxDistance=extent*6;renderer.domElement.dataset.loaded='true';setStatus('Модель загружена. Вращайте и приближайте, чтобы рассмотреть конструкцию.');};
  const loader=new GLTFLoader(manager);loader.setMeshoptDecoder(MeshoptDecoder);loader.load('/models/efeu/efeu-web.glb',gltf=>{model=gltf.scene;if(active)world.add(model);else dispose(model);},undefined,()=>{if(active)setStatus('Не удалось загрузить модель.');});
  const resize=()=>{if(!element.clientWidth)return;renderer.setSize(element.clientWidth,element.clientHeight);camera.aspect=element.clientWidth/element.clientHeight;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const render=()=>{controls.update();renderer.render(world,camera);frame=requestAnimationFrame(render);};render();
  return()=>{active=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();if(model)dispose(model);renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div><div className="spatial-canvas" ref={host}/><p role="status">{status}</p><a className="text-button" href="/models/efeu/efeu-web.glb" download="efeu.glb">Скачать 3D-модель GLB</a><p className="muted">EFEU · SEW‑EURODRIVE. Конструкция показана в исходной позиции шарниров. Это просмотр геометрии, не запись работы на объекте.</p><details><summary>Авторство и происхождение модели</summary><p>© 2025 SEW‑EURODRIVE, Yannick Wunderle, Leon Schönfeld. MIT.</p><p><a href="https://github.com/SEW-Eurodrive-Open-Source/Multimodal_AMR_dataset/tree/main/dataset_rosbag_viewer/ros2/urdf_viewer" target="_blank" rel="noreferrer">Исходная модель</a> · <a href="/models/efeu/LICENSE" target="_blank" rel="noreferrer">Лицензия</a> · <a href="/models/efeu/provenance.json" target="_blank" rel="noreferrer">Версия и контрольные суммы</a></p></details></div>;
}
