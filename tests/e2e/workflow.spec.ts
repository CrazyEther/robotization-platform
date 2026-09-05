import {test,expect} from '@playwright/test';
import catalog from '../../data/catalog.json' with {type:'json'};
test('real catalog → comparison → honest incomplete economy → event gate',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('heading',{name:'Найдите точку для автоматизации'})).toBeVisible();
 await page.getByRole('button',{name:'Перейти к решениям'}).click();
 await expect(page.getByRole('heading',{name:'MiR250',exact:true})).toBeVisible();
 const mir=page.locator('.product-card').filter({has:page.getByRole('heading',{name:'MiR250',exact:true})});await mir.getByRole('button',{name:'Сравнить',exact:true}).click();
 const omron=page.locator('.product-card').filter({hasText:'OMRON LD-250'});await omron.getByRole('button',{name:'Сравнить',exact:true}).click();
 await page.getByRole('button',{name:'Сравнить характеристики'}).click();await expect(page.getByRole('dialog',{name:'Сравнение решений'})).toContainText('250');
 await page.getByRole('button',{name:'К расчёту своей конфигурации'}).click();await page.getByRole('button',{name:'Рассчитать ресурсы',exact:true}).click();await expect(page.getByText('Недостаточно исходных данных').first()).toBeVisible();
 await page.getByRole('button',{name:'Рассчитать экономику',exact:true}).click();await expect(page.locator('.results .metric')).toHaveCount(0);
 await page.getByRole('button',{name:'Перейти к имитации'}).click();await expect(page.getByRole('heading',{name:'Загрузите события вашего процесса'})).toBeVisible();
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
test('research, filter, detail provenance and local empty scenario round-trip',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Каталог решений/}).click();await page.getByRole('textbox',{name:'Поиск решений'}).fill('KIRA');await expect(page.locator('.product-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Подробнее'}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Готовность данных');await expect(dialog.locator('a').first()).toHaveAttribute('href',/^https:\/\//);await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('button',{name:'Исследование',exact:true}).click();await expect(page.getByRole('heading',{name:'Реальные внедрения',exact:true})).toBeVisible();await expect(page.locator('.case-grid article')).toHaveCount(catalog.cases.length);
 await page.getByRole('button',{name:'Сценарии',exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт JSON',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('automation-scenario.json');
 await page.screenshot({path:'output/browser-'+test.info().project.name+'.png',fullPage:true});
});
test('real licensed digital log is playable without invented observations',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Бизнес-процесс Офисные операции'}).click();await page.getByRole('button',{name:/04 Имитация/}).click();await expect(page.getByRole('heading',{name:'Как проходят цифровые обращения'})).toBeVisible();await page.getByRole('button',{name:'Воспроизвести журнал'}).click();await expect(page.getByRole('button',{name:'Остановить журнал'})).toBeVisible();await page.getByRole('button',{name:'Остановить журнал'}).click();await page.getByRole('slider',{name:'Время журнала'}).fill(await page.getByRole('slider',{name:'Время журнала'}).getAttribute('max')??'');await expect(page.locator('.observed-cases')).toContainText('Closed');await page.screenshot({path:'output/digital-'+test.info().project.name+'.png',fullPage:true});});
