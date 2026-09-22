import {ArrowRight,ArrowUpRight,Box,Factory,HeartPulse,Layers3,MoveUpRight,Plane,Play,ShieldCheck,Warehouse} from 'lucide-react';
import './landing.css';

type Props={onStart:()=>void;onCatalog:()=>void;onStudio:()=>void};
const sectors=[
 {name:'Производство',detail:'Рабочие ячейки и внутризаводская логистика',icon:Factory},
 {name:'Склад и логистика',detail:'Перевозки, комплектация, хранение',icon:Warehouse},
 {name:'Медицина',detail:'Доставка материалов и сервисные процессы',icon:HeartPulse},
 {name:'Аэропорты',detail:'Логистика и обслуживание терминалов',icon:Plane},
];
export default function Landing({onStart,onCatalog,onStudio}:Props){
 return <div className="ris-landing">
  <header className="ris-head">
   <button className="ris-logo" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} aria-label="Robot Investment Studio — главная"><b>RIS<span>↗</span></b><small>ROBOT<br/>INVESTMENT<br/>STUDIO</small></button>
   <nav aria-label="Основная навигация"><button onClick={onStart}>Оценка проекта</button><button onClick={onStudio}>Моделирование</button><button onClick={onCatalog}>Каталог роботов</button><a href="#ris-method">Как это работает</a></nav>
   <button className="ris-mobile-market" aria-label="Каталог роботов" onClick={onCatalog}>Каталог</button>
   <button className="ris-head-cta" onClick={onStart}>Начать оценку <ArrowUpRight size={17}/></button>
  </header>
  <main>
   <section className="ris-hero" aria-labelledby="ris-hero-title">
    <div className="ris-hero-copy">
     <div className="ris-kicker"><span/> ЦИФРОВОЙ ИНСТРУМЕНТ ДЛЯ ОЦЕНКИ РОБОТИЗАЦИИ</div>
     <h1 id="ris-hero-title">А ЕСЛИ<br/><span>РОБОТ?</span></h1>
     <p className="ris-lead">Проверьте идею роботизации <em>до инвестиций.</em></p>
     <p className="ris-description">Опишите свой объект, выберите оборудование, смоделируйте процесс и оцените экономику проекта в одном пространстве.</p>
     <div className="ris-hero-actions"><button className="ris-primary" onClick={onStart}>Оценить роботизацию <ArrowUpRight size={21}/></button><button className="ris-secondary" onClick={onStudio}><Play size={16}/> Открыть симулятор</button></div>
     <div className="ris-trust"><ShieldCheck size={17}/> Предварительная оценка · Формулы и допущения открыты</div>
    </div>    <div className="ris-hero-art" aria-hidden="true">
     <div className="ris-crosshair ris-crosshair-a"/><div className="ris-crosshair ris-crosshair-b"/>
     <div className="ris-art-label ris-label-top">ТЕХНОЛОГИИ<br/>ДЛЯ РЕАЛЬНЫХ ЗАДАЧ <span>↗</span></div>
     <div className="ris-art-blue"/>
     <img src="/industrial-arm.svg" alt="" className="ris-art-robot"/>
     <div className="ris-art-number">01 / 04</div>
     <div className="ris-art-caption"><span className="ris-orange-dot"/> ОБЪЕКТ → МОДЕЛЬ → РЕЗУЛЬТАТ</div>
    </div>
    <div className="ris-hero-index">01 / ИДЕЯ <span>02 / МОДЕЛЬ</span><span>03 / РЕШЕНИЕ</span></div>
   </section>
   <section className="ris-steps" id="ris-method" aria-label="Четыре шага к оценке проекта">
     <div className="ris-steps-heading"><span>ПУТЬ К РЕШЕНИЮ</span><h2>Не гадать.<br/>Проверять.</h2></div>
     <div className="ris-step"><span>01</span><Box size={27}/><h3>Опишите объект</h3><p>Укажите процессы, объём работ и ограничения площадки.</p></div>
     <div className="ris-step"><span>02</span><Layers3 size={27}/><h3>Выберите роботов</h3><p>Сопоставьте технические характеристики и условия применения.</p></div>
     <div className="ris-step"><span>03</span><MoveUpRight size={27}/><h3>Проверьте сценарий</h3><p>Исследуйте загрузку, маршруты и узкие места в модели.</p></div>
     <div className="ris-step"><span>04</span><ArrowUpRight size={27}/><h3>Оцените вложения</h3><p>Сравните CAPEX, OPEX, окупаемость и чувствительность.</p></div>
   </section>   <section className="ris-workspace">
    <div><div className="ris-section-overline">ВНУТРИ ПЛАТФОРМЫ / 01</div><h2>Модель —<br/><span>не картинка.</span></h2><p>Сначала параметры объекта и работа оборудования. Затем — показатели процесса и расчёт инвестиций. Где исходных данных недостаточно, покажем ограничения оценки.</p><button className="ris-link" onClick={onStudio}>Перейти к моделированию <ArrowRight size={19}/></button></div>
    <div className="ris-workspace-screen"><div className="ris-screen-top"><span><i/> DEMO / TRANSPORT FLOW</span><span>СЦЕНАРИЙ 01 · 2D</span></div><div className="ris-map"><div className="ris-grid"/><div className="ris-zone z1">ПРИЁМКА</div><div className="ris-zone z2">ХРАНЕНИЕ</div><div className="ris-zone z3">ОТГРУЗКА</div><div className="ris-route"/><span className="ris-vehicle v1">◆</span><span className="ris-vehicle v2">◆</span><span className="ris-vehicle v3">◆</span></div><div className="ris-screen-bottom"><span>ПОДГОТОВКА МОДЕЛИ</span><span>МАРШРУТЫ · ОЧЕРЕДИ · ЗАГРУЗКА</span></div></div>
   </section>
   <section className="ris-sector-section"><div className="ris-sector-intro"><span className="ris-section-overline">РАЗНЫЕ ОБЪЕКТЫ · ЕДИНАЯ ЛОГИКА</span><h2>Где проверить<br/>роботизацию?</h2><p>Выберите сферу применения или создайте собственный сценарий.</p></div><div className="ris-sector-grid">{sectors.map(s=><button key={s.name} onClick={onStart}><s.icon size={28}/><strong>{s.name}</strong><small>{s.detail}</small><ArrowUpRight size={18} className="ris-sector-arrow"/></button>)}</div></section>
   <section className="ris-last"><span>ЕСТЬ ИДЕЯ ДЛЯ ВАШЕГО ОБЪЕКТА?</span><h2>Проверим её<br/><em>на модели.</em></h2><button onClick={onStart}>Создать проект <ArrowUpRight size={22}/></button></section>
  </main>
  <footer className="ris-footer"><b>RIS / ROBOT INVESTMENT STUDIO</b><span>Предварительная оценка. Результаты требуют проверки на объекте.</span><button onClick={onCatalog}>Каталог решений ↗</button></footer>
 </div>;
}
