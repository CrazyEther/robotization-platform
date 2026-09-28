import {expect,test} from '@playwright/test';

test('Cloudflare preview exposes the Simulation Core UI while keeping server compute and mutations closed',async({page,request})=>{
 test.skip(process.env.RIS_PREVIEW_TEST!=='true','Only runs against the isolated public-preview build');
 await page.goto('/');
 await expect(page.getByRole('status')).toContainText('ОЗНАКОМИТЕЛЬНАЯ ВЕРСИЯ');
 await expect(page.getByRole('heading',{name:/СНАЧАЛА/})).toBeVisible();

 const config=await request.get('/api/v1/config');
 expect(config.status()).toBe(200);
 expect((await config.json()).publicPreview).toBe(true);
 expect((await request.get('/api/v1/catalog')).status()).toBe(200);
 const coreStatus=await request.get('/api/v1/simulation-core/status');
 expect(coreStatus.status()).toBe(200);
 expect((await coreStatus.json()).engine).toBe('Simulation Core v2');

 await page.getByRole('button',{name:'Новый проект'}).click();
 await page.getByRole('button',{name:/К оборудованию/}).click();
 await expect(page.locator('.ris-robot')).toHaveCount(44);
 await page.getByRole('textbox',{name:'Поиск роботов'}).fill('MiR250');
 await page.getByRole('button',{name:/Моделировать этот робот/}).click();
 await expect(page.getByRole('heading',{name:/Помещение/})).toBeVisible();
 await expect(page.getByText(/Simulation Core v2 · fnv1a64:/)).toBeVisible();
 await expect(page.getByText(/AnyLogic используется как независимый validation backend/)).toBeVisible();

 const run=page.getByRole('button',{name:/Запустить Simulation Core/});
 await expect(run).toBeEnabled();
 await run.click();
 await expect(page.getByRole('alert')).toContainText('Публичный предпросмотр');
 await expect(page.locator('.dt-kpi-grid')).toHaveCount(0);

 for(const [method,path] of [
  ['post','/api/v1/simulation-core/study'],
  ['post','/api/v1/ris/cloud/run'],
  ['post','/api/v1/economics'],
  ['get','/api/v1/organizations'],
 ] as const){
  const response=await request[method](path,{data:method==='post'?{}:undefined});
  expect(response.status()).toBe(503);
  expect((await response.json()).code).toBe('PREVIEW_READ_ONLY');
 }
 await expect(page.getByRole('heading',{name:/Не удалось открыть приложение/})).toHaveCount(0);
});
