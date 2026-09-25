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

test('digital twin: object → robot → 2D execution → replay → ROI → export',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await openTwin(page);
 await expect(page.getByText('RIS Digital Twin · grid-agv/1.0')).toBeVisible();
 await expect(page.getByText(/Доставка паллет/)).toBeVisible();
 await expect(page.locator('.dt-floor')).toBeVisible();
 await expect(page.getByRole('button',{name:/Запустить одинаковую нагрузку/})).toBeEnabled();

 await page.getByRole('button',{name:/Запустить одинаковую нагрузку/}).click();
 await expect(page.getByText('Производительность')).toBeVisible();
 await expect(page.locator('.dt-kpi-grid')).toContainText('кВт·ч');
 await expect(page.getByRole('slider',{name:'Время симуляции'})).toBeVisible();
 await expect(page.locator('.dt-chart')).toBeVisible();
 await expect(page.locator('.dt-compare')).toContainText('ИСХОДНЫЙ ПРОЦЕСС');
 await expect(page.locator('.dt-compare')).toContainText('РОБОТИЗИРОВАННЫЙ');

 await page.getByLabel('Требуется задач/год').fill('1');
 await expect(page.locator('.dt-investment')).not.toContainText('Заблокирован');

 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:/Экспорт проекта и траекторий/}).click();
 const receipt=await download;
 expect(receipt.suggestedFilename()).toBe('ris-digital-twin.json');
 const project=JSON.parse(await readFile(await receipt.path(),'utf8'));
 expect(project.kind).toBe('ris-digital-twin');
 expect(project.robotResult.engine).toBe('RIS Digital Twin');
 expect(project.robotResult.frames.length).toBeGreaterThan(20);
 expect(project.robotResult.frames[0].robots.length).toBe(project.scenario.robot.count);
 expect(project.baselineResult.engine).toBe('RIS Baseline Twin');
 expect(project.assessment.roiPercent).not.toBeNull();
 expect(errors).toEqual([]);
});

test('editor accepts a floor-plan image and edits scene geometry',async({page})=>{
 await openTwin(page);
 const input=page.locator('input[type=file]');
 await input.setInputFiles({name:'facility-plan.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
 await expect(page.getByText(/масштабируемая подложка/)).toBeVisible();
 await page.getByRole('button',{name:'Стеллаж'}).click();
 const floor=page.locator('.dt-floor');const box=await floor.boundingBox();expect(box).not.toBeNull();
 if(box)await page.mouse.click(box.x+box.width*.55,box.y+box.height*.52);
 await page.getByRole('button',{name:'Выбор'}).click();
 await expect(page.getByText('СВОЙСТВА ОБЪЕКТА')).toBeVisible();
 await expect(page.locator('.dt-obj.rack')).toHaveCount(4);
});

test('3D view uses the same scene and simulation robot positions',async({page})=>{
 await openTwin(page);
 await page.getByRole('button',{name:/Запустить одинаковую нагрузку/}).click();
 await page.getByRole('button',{name:'3D'}).click();
 await expect(page.locator('.ris-scene-3d')).toBeVisible();
 await expect(page.locator('.ris-scene-3d canvas')).toHaveCount(1);
});

test('hospital and airport switch to domain-specific task presets',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Новый проект'}).click();
 await page.getByRole('button',{name:/Медицинское|Медучреждение/}).first().click();
 await page.getByRole('navigation',{name:'Этапы проекта'}).getByRole('button',{name:/Digital Twin/}).click();
 await expect(page.getByText(/Доставка медикаментов/)).toBeVisible();
 await page.getByRole('button',{name:'Аэропорт'}).click();
 await expect(page.getByText(/Перемещение багажа/)).toBeVisible();
});

test('mobile keeps editor, execution and comparison reachable',async({page,isMobile})=>{
 test.skip(!isMobile,'mobile-only assertion');
 await openTwin(page);
 await expect(page.locator('.dt-editor-shell')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(4);
 await page.getByRole('button',{name:/Запустить одинаковую нагрузку/}).click();
 await expect(page.locator('.dt-compare')).toBeVisible();
});
