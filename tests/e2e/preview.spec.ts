import {expect,test} from '@playwright/test';

test('Cloudflare public preview is read-only and never promises unavailable functionality',async({page,request})=>{
 test.skip(process.env.RIS_PREVIEW_TEST!=='true','Only runs against the isolated public-preview build');
 await page.goto('/');
 await expect(page.getByRole('status')).toContainText('ОЗНАКОМИТЕЛЬНАЯ ВЕРСИЯ');
 await expect(page.getByRole('heading',{name:/А ЕСЛИ/})).toBeVisible();
 const config=await request.get('/api/v1/config');
 expect(config.status()).toBe(200);
 expect((await config.json()).publicPreview).toBe(true);
 const catalog=await request.get('/api/v1/catalog');
 expect(catalog.status()).toBe(200);
 await page.getByRole('button',{name:'Создать проект'}).first().click();
 await page.getByRole('button',{name:'Перейти к роботам'}).click();
 await expect(page.locator('.ris-robot')).toHaveCount(44);
 await page.getByRole('textbox',{name:'Поиск роботов'}).fill('MiR250');
 await page.getByRole('button',{name:/Добавить в транспортный сценарий/}).click();
 await page.getByRole('button',{name:'Настроить симуляцию'}).click();
 await expect(page.getByRole('button',{name:'Запустить модель'})).toBeDisabled();
 for(const method of ['post','get'] as const){
  const path=method==='post'?'/api/v1/ris/experiment':'/api/v1/organizations';
  const response=await request[method](path,{data:method==='post'?{}:undefined});
  expect(response.status()).toBe(503);
  expect((await response.json()).code).toBe('PREVIEW_READ_ONLY');
 }
 await expect(page.getByRole('heading',{name:/Не удалось открыть приложение/})).toHaveCount(0);
});
