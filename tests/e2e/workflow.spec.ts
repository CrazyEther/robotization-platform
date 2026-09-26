import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function openTwin(page:import('@playwright/test').Page){
 await page.goto('/');
 await page.getByRole('button',{name:'Новый проект'}).click();
 await expect(page.getByRole('heading',{name:/Что именно/})).toBeVisible();
 await page.getByRole('button',{name:/К оборудованию/}).click();
 await page.getByRole('textbox',{name:'Поиск роботов'}).fill('MiR250');
 await expect(page.locator('.ris-robot')).toHaveCount(1);
 await page.getByRole('button',{name:/Моделировать этот робот/}).click();
 await expect(page.getByRole('heading',{name:/Помещение/})).toBeVisible();
}

async function loadMatchingAnyLogicEvidence(page:import('@playwright/test').Page){
 const packageDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:/Экспорт входов AnyLogic/}).click();
 const inputReceipt=await packageDownload;
 const pkg=JSON.parse(await readFile(await inputReceipt.path(),'utf8'));
 const s=pkg.input.scenario;
 type ReplayRobot={id:string;x:number;y:number;state:string;batteryPercent:number;taskId:string|null};
 const robots:ReplayRobot[]=Array.from({length:s.robot.count},(_:unknown,index:number)=>({id:'R'+(index+1),x:s.layout.pickup.x+.5,y:s.layout.pickup.y+.5,state:index?'idle':'loaded',batteryPercent:99,taskId:index?null:'T1'}));
 const common={created:120,backlog:0,throughputPerHour:15,meanQueueMinutes:.8,p95JobSeconds:145,resourceUtilization:.68,loadedMeters:0,emptyMeters:0,trafficWaitSeconds:0};
 const evidence={schemaVersion:'ris-anylogic-evidence/1',inputHash:pkg.inputHash,engine:'AnyLogic',engineVersion:'8.9.10',modelName:'RIS Transport Kernel',modelVersion:'0.1.0',runGroupId:'e2e-group',source:'desktop',input:pkg.input,
  baseline:{runId:'baseline-e2e',kpis:{...common,completed:115,energyKwh:0}},
  robot:{runId:'robot-e2e',kpis:{...common,completed:119,energyKwh:5.2,loadedMeters:1800,emptyMeters:1500,trafficWaitSeconds:20},frames:[
   {t:0,robots:robots.map((r:ReplayRobot)=>({...r,state:'idle',taskId:null,batteryPercent:100})),backlog:0,completed:0},
   {t:10,robots,backlog:1,completed:0},
   {t:20,robots:robots.map((r:ReplayRobot)=>({...r,x:s.layout.dropoff.x+.5,y:s.layout.dropoff.y+.5,state:'idle',taskId:null,batteryPercent:98})),backlog:0,completed:1}
  ]},warnings:[]};
 await page.getByTestId('anylogic-evidence-input').setInputFiles({name:'anylogic-evidence.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(evidence))});
 return {pkg,evidence};
}

test('AnyLogic evidence: scene → package → verified replay → ROI → export',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await openTwin(page);
 await expect(page.getByText(/AnyLogic · результат не загружен/)).toBeVisible();
 await expect(page.locator('.dt-kpis')).toContainText('KPI отсутствуют');
 await expect(page.locator('.dt-investment')).toContainText('Заблокирован');
 const {evidence}=await loadMatchingAnyLogicEvidence(page);
 await expect(page.locator('.dt-engine strong').filter({hasText:'AnyLogic 8.9.10'})).toBeVisible();
 await expect(page.locator('.dt-kpi-grid')).toContainText('119/120');
 await expect(page.getByRole('slider',{name:'Время симуляции'})).toBeVisible();
 await expect(page.locator('.dt-compare')).toContainText('ИСХОДНЫЙ ПРОЦЕСС · ANYLOGIC');
 await expect(page.locator('.dt-compare')).toContainText('РОБОТИЗИРОВАННЫЙ · ANYLOGIC');
 await page.getByLabel('Требуется задач/год').fill('1000');
 await expect(page.locator('.dt-investment')).not.toContainText('Заблокирован');
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:/Экспорт проекта и траекторий/}).click();
 const receipt=await download;
 const project=JSON.parse(await readFile(await receipt.path(),'utf8'));
 expect(project.kind).toBe('ris-anylogic-project');
 expect(project.evidence.engine).toBe('AnyLogic');
 expect(project.evidence.robot.runId).toBe(evidence.robot.runId);
 expect(project.assessment.roiPercent).not.toBeNull();
 expect(errors).toEqual([]);
});

test('changing a modeled input invalidates loaded AnyLogic evidence',async({page})=>{
 await openTwin(page);await loadMatchingAnyLogicEvidence(page);
 await expect(page.locator('.dt-kpi-grid')).toBeVisible();
 await page.getByLabel('Роботов').fill('4');
 await expect(page.locator('.dt-kpis')).toContainText('KPI отсутствуют');
 await expect(page.locator('.dt-investment')).toContainText('Заблокирован');
});

test('editor accepts a floor-plan image and edits scene geometry',async({page})=>{
 await openTwin(page);
 await page.locator('input[type=file]').first().setInputFiles({name:'facility-plan.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
 await expect(page.getByText(/масштабируемая подложка/)).toBeVisible();
 await page.getByRole('button',{name:'Стеллаж'}).click();
 const floor=page.locator('.dt-floor');const box=await floor.boundingBox();expect(box).not.toBeNull();
 if(box)await page.mouse.click(box.x+box.width*.55,box.y+box.height*.52);
 await page.getByRole('button',{name:'Выбор'}).click();
 await expect(page.getByText('СВОЙСТВА ОБЪЕКТА')).toBeVisible();
 await expect(page.locator('.dt-obj.rack')).toHaveCount(4);
});

test('3D view replays positions from imported AnyLogic evidence',async({page})=>{
 await openTwin(page);await loadMatchingAnyLogicEvidence(page);
 await page.getByRole('button',{name:'3D'}).click();
 await expect(page.locator('.ris-scene-3d')).toBeVisible();
 await expect(page.locator('.ris-scene-3d canvas')).toHaveCount(1);
});

test('hospital and airport switch to domain-specific task presets',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Новый проект'}).click();
 await page.getByRole('button',{name:/Медицинское|Медучреждение/}).first().click();
 await page.getByRole('navigation',{name:'Этапы проекта'}).getByRole('button',{name:/Digital Twin/}).click();
 await expect(page.getByText(/Доставка медикаментов/)).toBeVisible();
 await page.getByRole('button',{name:'Аэропорт'}).click();
 await expect(page.locator('strong.dt-process')).toContainText('Доставка багажа: сортировка → зона выдачи');
});

test('mobile keeps editor, evidence execution and comparison reachable',async({page,isMobile})=>{
 test.skip(!isMobile,'mobile-only assertion');
 await openTwin(page);await loadMatchingAnyLogicEvidence(page);
 await expect(page.locator('.dt-editor-shell')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(4);
 await expect(page.locator('.dt-compare')).toContainText('ANYLOGIC');
});
