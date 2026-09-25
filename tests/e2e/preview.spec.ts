import {expect,test} from '@playwright/test';

test('Cloudflare preview runs only the browser twin and keeps server mutations closed',async({page,request})=>{
 test.skip(process.env.RIS_PREVIEW_TEST!=='true','Only runs against the isolated public-preview build');
 await page.goto('/');
 await expect(page.getByRole('status')).toContainText('ОЗНАКОМИТЕЛЬНАЯ ВЕРСИЯ');
 await expect(page.getByRole('heading',{name:/СНАЧАЛА/})).toBeVisible();
 const config=await request.get('/api/v1/config');
 expect(config.status()).toBe(200);
 expect((await config.json()).publicPreview).toBe(true);
 const catalog=await request.get('/api/v1/catalog');
 expect(catalog.status()).toBe(200);

 await page.getByRole('button',{name:'Новый проект'}).click();
 await page.getByRole('button',{name:/К оборудованию/}).click();
 await expect(page.locator('.ris-robot')).toHaveCount(44);
 await page.getByRole('textbox',{name:'Поиск роботов'}).fill('MiR250');
 await page.getByRole('button',{name:/Моделировать этот робот/}).click();
 await expect(page.getByRole('heading',{name:/Помещение/})).toBeVisible();
 await expect(page.getByText(/AnyLogic connector отключён/)).toBeVisible();
 const run=page.getByRole('button',{name:/Запустить одинаковую нагрузку/});
 await expect(run).toBeEnabled();
 await run.click();
 await expect(page.locator('.dt-kpi-grid')).toContainText('кВт·ч');

 for(const [method,path] of [['post','/api/v1/ris/cloud/run'],['post','/api/v1/economics'],['get','/api/v1/organizations']] as const){
  const response=await request[method](path,{data:method==='post'?{}:undefined});
  expect(response.status()).toBe(503);
  expect((await response.json()).code).toBe('PREVIEW_READ_ONLY');
 }
 await expect(page.getByRole('heading',{name:/Не удалось открыть приложение/})).toHaveCount(0);
});
