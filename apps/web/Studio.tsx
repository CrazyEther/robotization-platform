import {useState} from 'react';
import {ArrowRight,ArrowUpRight,Box,Check,ChevronRight,Factory,HeartPulse,Info,Plane,Search,ShieldAlert,ShoppingBag,Warehouse} from 'lucide-react';
import registry from '../../data/catalog.json';
import {createScenario,sectorTemplates,type Sector,type SimulationInput} from '../../packages/ris/contracts';
import DigitalTwinStudio from './DigitalTwinStudio';
import './studio.css';

const publicPreview=import.meta.env.VITE_PUBLIC_PREVIEW==='true';
type Screen='welcome'|'object'|'market'|'studio';
type Product=(typeof registry.products)[number];
const sectors:[Sector,typeof Warehouse][]=[['warehouse',Warehouse],['factory',Factory],['hospital',HeartPulse],['airport',Plane]];
const steps:[Screen,string,typeof Box][]=[['object','Объект',Box],['market','Оборудование',ShoppingBag],['studio','Digital Twin Studio',Factory]];
const getCharacteristic=(p:Product,key:string)=>p.characteristics.find(c=>c.key===key)?.value;
const sourceFor=(p:Product)=>registry.sources.filter(s=>p.sourceIds.includes(s.id));

export default function Studio(){
 const [screen,setScreen]=useState<Screen>('welcome'),[scenario,setScenario]=useState<SimulationInput>(()=>createScenario('warehouse'));
 const [selected,setSelected]=useState<string|null>(null),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const chosen=registry.products.find(p=>p.id===selected)??null;
 const setTab=(value:Screen)=>{setScreen(value);window.scrollTo({top:0,behavior:'instant'});};
 const chooseSector=(sector:Sector)=>{setScenario(createScenario(sector));setSelected(null);setTab('object');};
 const field=(key:keyof SimulationInput['workload'],value:number)=>setScenario(old=>({...old,workload:{...old.workload,[key]:value}}));
 const chooseProduct=(product:Product)=>{
  if(product.familyId!=='transport')return;
  const payload=getCharacteristic(product,'payload'),maxSpeed=getCharacteristic(product,'max_speed');
  setSelected(product.id);
  setScenario(old=>({...old,robot:{...old.robot,...(typeof payload==='number'?{payloadKg:payload}:{}),...(typeof maxSpeed==='number'?{speedMps:Math.min(maxSpeed,old.robot.speedMps)}:{})}}));
  setTab('studio');
 };
 const filtered=registry.products.filter(p=>(filter==='all'||filter===p.familyId)&&[p.name,p.vendor,p.summary].join(' ').toLowerCase().includes(query.toLowerCase()));

 return <div className="ris-site">
  {publicPreview&&<div className="ris-preview-banner" role="status">ОЗНАКОМИТЕЛЬНАЯ ВЕРСИЯ · Digital Twin выполняется локально в браузере. Серверные аккаунты, сохранение проектов и профессиональные облачные движки отключены.</div>}
  <header className="ris-global"><button className="ris-wordmark" onClick={()=>setTab('welcome')} aria-label="Robot Investment Studio"><b>RIS<span>↗</span></b><small>ROBOT<br/>INVESTMENT<br/>STUDIO</small></button>
   <nav aria-label="Навигация платформы"><button onClick={()=>setTab('welcome')}>Продукт</button><button onClick={()=>setTab('object')}>Объект</button><button onClick={()=>setTab('market')}>Роботы</button><button onClick={()=>setTab('studio')}>Digital Twin</button></nav>
   <button className="ris-top-action" onClick={()=>setTab('object')}>Новый проект <ArrowUpRight size={18}/></button></header>

  {screen==='welcome'?<main className="ris-home">
   <section className="ris-home-hero"><div className="ris-hero-info"><div className="ris-eyebrow"><span/> ЦИФРОВОЙ ДВОЙНИК ДЛЯ ПРЕДЫНВЕСТИЦИОННОЙ ОЦЕНКИ</div>
    <h1>СНАЧАЛА<br/><em>СИМУЛЯЦИЯ.</em></h1><p className="ris-home-lead">Посмотрите, как робот будет работать в вашем помещении — до закупки оборудования.</p>
    <p className="ris-sub">Загрузите план, настройте стены, стеллажи и рабочие зоны, выберите робота и процесс, запустите одинаковую нагрузку для baseline и роботизированного варианта, затем сравните производительность и экономику.</p>
    <div className="ris-actions"><button className="ris-primary" onClick={()=>setTab('object')}>Создать цифровой двойник <ArrowUpRight size={21}/></button><button className="ris-secondary" onClick={()=>setTab('studio')}>Открыть студию</button></div>
    <p className="ris-disclaimer"><ShieldAlert size={16}/> RIS Digital Twin — собственный проверяемый движок. AnyLogic подключается отдельным адаптером и не имитируется декоративной анимацией.</p>
   </div><div className="ris-hero-art" aria-hidden="true"><div className="ris-hero-blue"/><img src="/industrial-arm.svg" alt=""/><span className="ris-art-index">01 / ПОМЕЩЕНИЕ · ДВИЖЕНИЕ · KPI · ROI</span></div></section>
   <section className="ris-home-how"><div><span className="ris-mini-label">ЕДИНЫЙ РАБОЧИЙ ПРОЦЕСС</span><h2>От плана<br/><em>к траектории.</em></h2></div>{[
    ['01','План помещения','PNG/JPG как подложка, JSON-геометрия и ручная калибровка'],
    ['02','2D / 3D сцена','Стены, стеллажи, двери, зарядки, станции и рабочие зоны'],
    ['03','Исполнение модели','Движение нескольких роботов, очереди, трафик, батарея и replay'],
    ['04','Сравнение и ROI','Baseline и роботизированный вариант проходят одну нагрузку']
   ].map(([i,title,desc])=><button key={i} onClick={()=>setTab(i==='01'?'object':'studio')}><b>{i}</b><ArrowUpRight size={23}/><strong>{title}</strong><span>{desc}</span></button>)}</section>
   <section className="ris-industries"><div><span className="ris-mini-label">СЦЕНАРИИ</span><h2>Начните с отраслевого шаблона.</h2><p>Шаблон — стартовая конфигурация. Геометрию и параметры процесса можно заменить данными конкретного объекта.</p></div><div className="ris-industry-grid">{sectors.map(([key,Icon])=><button key={key} onClick={()=>chooseSector(key)}><Icon size={29}/><strong>{sectorTemplates[key].title}</strong><span>{sectorTemplates[key].operation}</span><ArrowUpRight className="ris-industry-arrow" size={19}/></button>)}</div></section>
  </main>:
  <div className="ris-workspace"><aside className="ris-side"><div className="ris-side-kicker">DIGITAL TWIN / PROJECT</div><h2>Модель<br/>объекта.</h2><div className="ris-side-context"><span className="ris-status-dot"/> {sectorTemplates[scenario.sector].title}<small>{sectorTemplates[scenario.sector].operation}</small></div>
   <nav aria-label="Этапы проекта">{steps.map(([key,label,Icon],i)=><button key={key} className={screen===key?'active':''} onClick={()=>setTab(key)}><span className="ris-nav-index">0{i+1}</span><Icon size={18}/><strong>{label}</strong><ChevronRight size={16}/></button>)}</nav>
   <div className="ris-side-end"><Info size={18}/> Сцена и траектории дают инженерную модель процесса, но физическая безопасность, сертификация и паспортные ограничения требуют отдельной проверки.</div></aside>
   <main className="ris-content"><div className="ris-content-top"><span>RIS / DIGITAL TWIN PROJECT</span><div><span className="ris-project-pill">{chosen?'Робот: '+chosen.name:'Выберите оборудование'}</span></div></div>

   {screen==='object'&&<><div className="ris-page-heading"><span className="ris-mini-label">ЭТАП 01 / ОБЪЕКТ И НАГРУЗКА</span><h1>Что именно<br/><em>должно происходить?</em></h1><p>Опишите поток работы до построения модели. Эти параметры одинаково используются baseline и роботизированным сценарием.</p></div>
    <div className="ris-work-card"><h3>Тип объекта</h3><div className="ris-type-grid">{sectors.map(([key,Icon])=><button key={key} className={scenario.sector===key?'selected':''} onClick={()=>chooseSector(key)}><Icon size={28}/><strong>{sectorTemplates[key].title}</strong><small>{sectorTemplates[key].operation}</small>{scenario.sector===key&&<Check size={20}/>}</button>)}</div></div>
    <div className="ris-work-card ris-card-split"><div><span className="ris-mini-label">РАБОЧАЯ НАГРУЗКА</span><h3>{sectorTemplates[scenario.sector].subtitle}</h3><p>Задайте общий поток заданий. Конкретную геометрию, рабочие зоны и препятствия вы настроите внутри Digital Twin Studio.</p></div><div className="ris-fields"><label>Заданий в час<input aria-label="Заданий в час" type="number" min=".1" value={scenario.workload.demandPerHour} onChange={e=>field('demandPerHour',Number(e.target.value))}/></label><label>Масса одного задания, кг<input aria-label="Масса груза" type="number" min=".1" value={scenario.workload.loadKg} onChange={e=>field('loadKg',Number(e.target.value))}/></label><label>Продолжительность смены, ч<input aria-label="Часов в смену" type="number" min=".25" max="24" step=".25" value={scenario.workload.shiftHours} onChange={e=>field('shiftHours',Number(e.target.value))}/></label></div></div>
    <div className="ris-next"><span>Следующий этап: выберите мобильную платформу.</span><button className="ris-primary" onClick={()=>setTab('market')}>К оборудованию <ArrowRight size={19}/></button></div></>}

   {screen==='market'&&<><div className="ris-page-heading"><span className="ris-mini-label">ЭТАП 02 / ОБОРУДОВАНИЕ</span><h1>Выберите<br/><em>робота.</em></h1><p>Для Digital Twin сейчас исполняются транспортные мобильные роботы. Остальной каталог сохраняется как справочник и будет подключаться через новые сценарные адаптеры.</p></div>
    <div className="ris-market-controls"><label><Search size={18}/><input aria-label="Поиск роботов" placeholder="Модель, производитель, задача..." value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Категория оборудования" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Все категории</option>{[...new Set(registry.products.map(p=>p.familyId))].map(k=><option key={k} value={k}>{k}</option>)}</select><span>{filtered.length} решений</span></div>
    <div className="ris-market-grid">{filtered.map(p=><article key={p.id} className={'ris-robot '+(selected===p.id?'selected':'')}><div className="ris-robot-top"><span>{p.familyId.toUpperCase()}</span><span>{p.vendor}</span></div><div className="ris-robot-image"><Box size={53} strokeWidth={1.1}/></div><h3>{p.name}</h3><p>{p.summary}</p><div className="ris-specs">{p.characteristics.slice(0,3).map(c=><div key={c.key}><span>{c.label}</span><strong>{String(c.value)} {c.unit}</strong></div>)}{!p.characteristics.length&&<small>Численные характеристики требуют подтверждения.</small>}</div><div className="ris-source-row">{sourceFor(p).slice(0,2).map(src=><a key={src.id} href={src.url} target="_blank" rel="noreferrer">Источник ↗</a>)}</div><button disabled={p.familyId!=='transport'} className="ris-robot-button" onClick={()=>chooseProduct(p)}>{p.familyId==='transport'?(selected===p.id?'Открыть в Digital Twin':'Моделировать этот робот'):'Сценарный адаптер ещё не реализован'} <ArrowUpRight size={17}/></button></article>)}</div>
    <div className="ris-next"><span>{chosen?'Выбрано: '+chosen.name:'Выберите транспортного робота или откройте студию с первым доступным вариантом.'}</span><button className="ris-primary" onClick={()=>setTab('studio')}>Digital Twin Studio <ArrowRight size={19}/></button></div></>}

   {screen==='studio'&&<DigitalTwinStudio key={scenario.sector+'-'+(selected??'default')} initialScenario={scenario} initialRobotId={selected} onScenario={setScenario}/>}
   </main></div>}
 </div>;
}
