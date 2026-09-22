import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function prepareTransport(page:import('@playwright/test').Page){
 await page.goto('/');
 await page.getByRole('button',{name:'Создать проект'}).first().click();
 await expect(page.getByRole('heading',{name:/Что будем/})).toBeVisible();
 await page.getByRole('button',{name:'Перейти к роботам'}).click();
 await page.getByRole('textbox',{name:'Поиск роботов'}).fill('MiR250');
 await expect(page.locator('.ris-robot')).toHaveCount(1);
 await page.getByRole('button',{name:/Добавить в транспортный сценарий/}).click();
 await expect(page.getByRole('heading',{name:/Здесь робот/})).toBeVisible();
 await expect(page.getByText(/м$/, {exact:false}).first()).toBeVisible();
 await page.getByRole('button',{name:'Настроить симуляцию'}).click();
}
test('one coherent experience: object → marketplace → layout → SimPy → investment → report',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await prepareTransport(page);
 await page.getByRole('button',{name:'Запустить модель'}).click();
 await expect(page.getByText('SIMPY · РЕЗУЛЬТАТ')).toBeVisible({timeout:15000});
 await expect(page.locator('.ris-kpi-grid')).toContainText('P95');
 await expect(page.locator('.ris-kpi-grid')).toContainText('Зарядные посты');
 await expect.poll(async()=>page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(3);
 await expect(page.getByText(/Дискретно-событийная транспортная модель/)).toBeVisible();
 await page.getByRole('button',{name:'Перейти к инвестициям'}).click();
 await expect(page.getByRole('heading',{name:/Сколько стоит/})).toBeVisible();
 await expect(page.getByText(/ROI за/)).toBeVisible();
 await expect(page.getByText('Недостаточно данных').first()).toBeVisible();
 await page.getByRole('spinbutton',{name:'Цена одного робота'}).fill('2000000');
 await page.getByRole('spinbutton',{name:'Текущие денежные расходы / год'}).fill('10000000');
 await page.getByRole('spinbutton',{name:'Сохраняемые расходы на людей / год'}).fill('2000000');
 await page.getByRole('spinbutton',{name:'Необходимые операций в год'}).fill('30000');
 await page.getByRole('spinbutton',{name:'Текущий фактический выпуск / год'}).fill('40000');
 await expect(page.getByText('Недостаточно данных').first()).toHaveCount(0);
 await page.getByRole('button',{name:'Сформировать отчёт'}).click();
 await expect(page.getByRole('heading',{name:/Проверяемый/})).toBeVisible();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Скачать JSON отчёта'}).click();
 const receipt=await download;
 expect(receipt.suggestedFilename()).toBe('ris-investment-assessment.json');
 const exported=JSON.parse(await readFile(await receipt.path(),'utf8'));
 expect(exported.simulation.engine).toBe('SimPy');
 expect(exported.simulation.engineVersion).toBe('simpy-transport/0.3');
 expect(exported.simulation.loadedMeters).toBeGreaterThan(0);
 expect(exported.simulation.p95JobSeconds).toBeGreaterThan(0);
 expect(exported.investment.annualCompleted).toBe(exported.simulation.completed*exported.financeInputs.daysPerYear);
 expect(exported.investment.annualOpex).toBeCloseTo(exported.financeInputs.maintenanceAnnual+exported.simulation.energyKwh*exported.financeInputs.daysPerYear*exported.financeInputs.electricityPerKwh);
 expect(exported.simulation.inputHash).toMatch(/^[a-f0-9]{64}$/);
 expect(errors).toEqual([]);
});
test('catalog is independent and explicitly limits unsupported simulation families',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Маркетплейс'}).first().click();
 await expect(page.locator('.ris-robot')).toHaveCount(44);
 await page.getByRole('textbox',{name:'Поиск роботов'}).fill('KIRA');
 await expect(page.locator('.ris-robot')).toHaveCount(1);
 await expect(page.getByRole('button',{name:/Модуль симуляции недоступен/})).toBeDisabled();
 await expect(page.locator('.ris-source-row a').first()).toHaveAttribute('href',/^https:\/\//);
});
test('changing model invalidates previous simulation result and ROI',async({page})=>{
 await prepareTransport(page);
 await page.getByRole('button',{name:'Запустить модель'}).click();
 await expect(page.getByText('SIMPY · РЕЗУЛЬТАТ')).toBeVisible({timeout:15000});
 await page.getByRole('spinbutton',{name:'Количество роботов'}).fill('4');
 await expect(page.getByText('ОЖИДАНИЕ ЭКСПЕРИМЕНТА')).toBeVisible();
 await page.getByRole('button',{name:'Экономика'}).click();
 await expect(page.getByText(/Сначала выполните имитацию процесса/)).toBeVisible();
});
test('mobile interface keeps the full workflow reachable',async({page,isMobile})=>{
 if(!isMobile)return;
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/А ЕСЛИ/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(3);
 await page.getByRole('button',{name:'Создать проект'}).first().click();
 await expect(page.getByRole('navigation',{name:'Этапы проекта'})).toBeVisible();
 await page.getByRole('navigation',{name:'Этапы проекта'}).getByRole('button',{name:/Маркетплейс/}).click();
 await expect(page.locator('.ris-robot')).toHaveCount(44);
});

test('late response must not restore results for changed robot configuration',async({page})=>{
 await prepareTransport(page);
 let release:()=>void=()=>{throw new Error('route not reached');};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let intercepted=false;
 await page.route('**/api/v1/ris/simulate',async route=>{
  intercepted=true;
  await gate;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   engine:'SimPy',engineVersion:'test',status:'complete',routeMeters:42,
   created:777777,completed:777777,backlog:0,throughputPerHour:999999,
   meanQueueMinutes:0,robotUtilization:.9,distanceMeters:100,energyKwh:10,
   chargingHours:0,warnings:[],inputHash:'deliberately-stale',wallTimeMs:1
  })});
 });
 await page.locator('.ris-run-button').click();
 await expect.poll(()=>intercepted).toBe(true);
 await page.locator('.ris-two-fields input').first().fill('4');
 release();
 await expect(page.locator('.ris-run-button')).toBeEnabled();
 await expect(page.locator('.ris-kpi-grid')).not.toContainText('777777');
 await page.locator('.ris-side nav button').nth(4).click();
 await expect(page.locator('.ris-alert')).toBeVisible();
});
