import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Download,Info,Play,ShieldAlert} from 'lucide-react';
import {comparisonRequestSchema,comparisonResultSchema,type CompareFinance,type ComparisonResult} from '../../packages/ris/compare';
import type {SimulationInput} from '../../packages/ris/contracts';

type Props={scenario:SimulationInput;robotName:string|null;finance:CompareFinance;
 onFinance:(value:CompareFinance)=>void;result:ComparisonResult|null;
 onResult:(value:ComparisonResult|null)=>void;onMarket:()=>void};
const cash=(v:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(v)+' ₽';
const measure=(v:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(v);
const financialFields:[keyof CompareFinance,string][]=[
 ['baselineWorkers','Сотрудников в текущем процессе'],
 ['baselineTaskSeconds','Время текущей операции, с'],
 ['baselineAnnualCostRub','Денежные расходы текущего процесса, ₽/год'],
 ['residualHumanCostAnnualRub','Сохраняемые расходы на персонал, ₽/год'],
 ['robotUnitPriceRub','Цена одного робота, ₽'],
 ['installationRub','Интеграция и монтаж, ₽'],
 ['infrastructureRub','Подготовка площадки, ₽'],
 ['chargersRub','Зарядная инфраструктура, ₽'],
 ['annualMaintenanceRub','Обслуживание одного робота, ₽/год'],
 ['electricityRubPerKwh','Тариф электроэнергии, ₽/кВт·ч'],
 ['workdaysPerYear','Рабочих смен в году'],
 ['horizonYears','Горизонт инвестиций, лет'],
 ['discountRatePercent','Ставка дисконтирования, %'],
 ['annualRequiredJobs','Необходимые операции, шт./год'],
 ['marginRubPerAdditionalJob','Маржинальный доход дополнительной операции, ₽']
];
function save(name:string,source:unknown){const u=URL.createObjectURL(new Blob([JSON.stringify(source,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
export default function CompareStudio({scenario,robotName,finance,onFinance,result,onResult,onMarket}:Props){
 const [counts,setCounts]=useState(()=>scenario.robot.count>=30?[1,15,30]:scenario.robot.count<=1?[1,2,4]:[Math.max(1,Math.floor(scenario.robot.count/2)),scenario.robot.count,Math.min(30,scenario.robot.count*2)]);
 const [running,setRunning]=useState(false),[error,setError]=useState('');
 const generation=useRef(0);
 useEffect(()=>()=>{generation.current++;},[]);
 const update=(key:keyof CompareFinance,value:number)=>{generation.current++;onFinance({...finance,[key]:value});onResult(null);setRunning(false);setError('');};
 const setCount=(idx:number,value:number)=>{generation.current++;setCounts(old=>old.map((n,i)=>i===idx?value:n));onResult(null);setRunning(false);setError('');};
 async function execute(){const request=comparisonRequestSchema.safeParse({scenario,finance,robotCounts:counts});
  if(!request.success){setError(request.error.issues.map(i=>i.message).join('; '));return;}
  const requestId=++generation.current;setRunning(true);setError('');onResult(null);
  try{const res=await fetch('/api/v1/ris/compare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request.data)});
   const body=await res.json();if(requestId!==generation.current)return;
   if(!res.ok)throw new Error(body.error||'JaamSim недоступен');
   const parsed=comparisonResultSchema.safeParse(body);
   if(!parsed.success)throw new Error('Получен несовместимый или неполный отчёт JaamSim.');
   onResult(parsed.data);
  }catch(e){if(requestId===generation.current)setError(e instanceof Error?e.message:'Ошибка эксперимента');}
  finally{if(requestId===generation.current)setRunning(false);}
 }

 return <section className="ris-compare">
 <div className="ris-page-heading"><span className="ris-mini-label">ПРОФЕССИОНАЛЬНЫЙ DES / СРАВНЕНИЕ ИНВЕСТИЦИЙ</span>
 <h1>До робота.<br/><em>После робота.</em></h1>
 <p>JaamSim моделирует один и тот же входящий поток заданий для текущего процесса и разных размеров парка. Пиковый сценарий увеличивает поток на 25%. Это модель очередей и ресурсов, не физическая симуляция Gazebo.</p></div>
 {!robotName&&<div className="ris-alert"><ShieldAlert size={17}/> Сначала выберите транспортного робота в маркетплейсе. <button onClick={onMarket}>К каталогу <ArrowRight size={16}/></button></div>}
 <div className="ris-work-card"><div className="ris-card-title"><Info size={20}/><h3>Сравниваемые конфигурации</h3></div>
 <p className="ris-note">Текущий объект: {scenario.sector} · выбрано оборудование: {robotName??'не выбрано'}. Объём и маршрут используются из общей модели проекта; точные характеристики оборудования необходимо подтвердить.</p>
 <div className="ris-fields ris-two-fields">
  {financialFields.map(([key,label])=><label key={key}>{label}<input type="number" min={0} step={key==='discountRatePercent'||key==='electricityRubPerKwh'?.1:1} aria-label={label} value={finance[key]} onChange={e=>update(key,Number(e.target.value))}/></label>)}
 </div>
 <div className="ris-compare-fleets"><strong>Количество роботов в сравниваемых вариантах</strong>
 <div className="ris-fields ris-three-fields">{counts.map((count,i)=><label key={i}>Вариант {i+1}<input type="number" min="1" max="30" aria-label={'Роботов, вариант '+(i+1)} value={count} onChange={e=>setCount(i,Number(e.target.value))}/></label>)}</div></div>
 <p className="ris-note">При сравнении парков предполагается одинаковая цена одного робота и стоимость обслуживания одного робота. Интеграция, инфраструктура и зарядные станции считаются одинаковыми для вариантов: скорректируйте их отдельно в проекте при необходимости.</p><p className="ris-note">Маржа дополнительной операции учитывается только в разнице числа выполненных заданий. Не указывайте выручку, если дополнительный объём невозможно продать. Оценка энергетики не является результатом физической симуляции.</p>
 <button className="ris-primary ris-run-button" disabled={!robotName||running} onClick={execute}><Play size={17}/>{running?'JaamSim выполняет реальные эксперименты…':'Сравнить процесс и инвестиции'}</button>
 {error&&<p role="alert" className="ris-error">{error}</p>}</div>
 {result&&<><div className="ris-work-card"><span className="ris-mini-label">ДВИЖОК / ПРОИСХОЖДЕНИЕ</span><h3>JaamSim {result.engineVersion} · {result.options.length+result.peak.options.length+2} выполненных моделей</h3>
 <div className="ris-comparison-table"><table><thead><tr><th>Режим / конфигурация</th><th>Поступило</th><th>Выполнено</th><th>Остаток</th><th>Среднее ожидание, мин</th><th>Загрузка ресурса</th><th>CAPEX</th><th>ROI за {finance.horizonYears} лет</th><th>NPV</th></tr></thead><tbody>
 <tr><td>Текущий процесс · {finance.baselineWorkers} сотрудников</td><td>{result.baseline.arrived}</td><td>{result.baseline.completed}</td><td>{result.baseline.backlog}</td><td>{measure(result.baseline.queueMeanMinutes)}</td><td>{measure(result.baseline.utilization*100)}%</td><td>—</td><td>Базовый сценарий</td><td>—</td></tr>
 {result.options.map(o=><tr key={'normal-'+o.robotCount}><td>Роботизация · {o.robotCount} роботов</td><td>{o.arrived}</td><td>{o.completed}</td><td>{o.backlog}</td><td>{measure(o.queueMeanMinutes)}</td><td>{measure(o.utilization*100)}%</td><td>{cash(o.capexRub)}</td><td>{o.roiPercent===null?'Не рассчитан':measure(o.roiPercent)+'%'}</td><td>{o.npvRub===null?'Не определён':cash(o.npvRub)}</td></tr>)}
 <tr className="ris-compare-divider"><td>ПИК · текущий процесс, 125%</td><td>{result.peak.baseline.arrived}</td><td>{result.peak.baseline.completed}</td><td>{result.peak.baseline.backlog}</td><td>{measure(result.peak.baseline.queueMeanMinutes)}</td><td>{measure(result.peak.baseline.utilization*100)}%</td><td>—</td><td>Базовый сценарий</td><td>—</td></tr>
 {result.peak.options.map(o=><tr key={'peak-'+o.robotCount}><td>ПИК · {o.robotCount} роботов</td><td>{o.arrived}</td><td>{o.completed}</td><td>{o.backlog}</td><td>{measure(o.queueMeanMinutes)}</td><td>{measure(o.utilization*100)}%</td><td>{cash(o.capexRub)}</td><td>{o.roiPercent===null?'Не рассчитан':measure(o.roiPercent)+'%'}</td><td>{o.npvRub===null?'Не определён':cash(o.npvRub)}</td></tr>)}
 </tbody></table></div></div>
 <div className="ris-work-card"><h3>Как рассчитана экономика</h3><p>Для каждого варианта: CAPEX = цена робота × число роботов + интеграция + инфраструктура + зарядные станции. Годовой эффект = затраты текущего процесса − годовые затраты роботизированного процесса + маржинальный вклад изменения числа выполненных заданий. ROI и NPV не выводятся, если вариант не выполняет установленный годовой план или не заполнена цена оборудования.</p>
 <div className="ris-comparison-table"><table><thead><tr><th>Вариант</th><th>Годовой OPEX</th><th>Оценка энергии/год</th><th>Изменение выпуска/год</th><th>Годовой эффект</th><th>TCO текущего процесса</th><th>TCO роботов</th><th>Окупаемость</th></tr></thead><tbody>
 {result.options.map(o=><tr key={o.robotCount}><td>{o.robotCount} роботов</td><td>{cash(o.annualOpexRub)}</td><td>{measure(o.annualEnergyKwhEstimated)} кВт·ч</td><td>{measure(o.annualIncrementalJobs)}</td><td>{cash(o.annualNetBenefitRub)}</td><td>{cash(o.baselineTcoRub)}</td><td>{cash(o.robotTcoRub)}</td><td>{o.paybackYears===null?'Не определена':measure(o.paybackYears)+' года'}</td></tr>)}
 </tbody></table></div>
 <p className="ris-result-note">Экономические выводы зависят от введённых денежных данных, исходного времени операции и соответствия требуемому объёму. Пиковый сценарий — отдельный контрфактический эксперимент, а не обещание фактической производительности.</p>
 <button className="ris-secondary" onClick={()=>save('ris-jaamsim-scenario-comparison.json',{schemaVersion:1,scenario,robotName,finance,comparison:result})}><Download size={17}/> Экспорт всех экспериментов и экономических расчётов</button></div>
 <div className="ris-work-card"><h3>Ограничения результатов</h3>{result.modelLimitations.map(w=><p className="ris-report-warning" key={w}><ShieldAlert size={17}/>{w}</p>)}</div></>}
 </section>;
}
