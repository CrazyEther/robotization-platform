import {expect,test} from '@playwright/test';

test('landing presents the assessment, simulation and catalog entry points',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toContainText('РОБОТ?');
 await expect(page.getByRole('button',{name:'Оценить роботизацию'})).toBeVisible();
 await expect(page.locator('.ris-art-robot')).toBeVisible();
 await page.getByRole('button',{name:'Оценить роботизацию'}).click();
 await expect(page.locator('.stepper')).toBeVisible();
 await expect(page.locator('.object-grid')).toBeVisible();
});

test('catalog opens as an independent section with populated entries',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Каталог роботов'}).click();
 await expect(page.locator('.sidebar')).toBeVisible();
 await expect(page.locator('.main-shell')).toBeVisible();
 await expect(page.getByText('44 кандидатов')).toBeVisible();
});

test('landing remains usable on narrow screens and simulation opens',async({page,isMobile})=>{
 await page.goto('/');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 expect(overflow).toBeLessThanOrEqual(3);
 await page.getByRole('button',{name:'Открыть симулятор'}).click();
 await expect(page.locator('.stepper')).toBeVisible();
 await expect(page.locator('.stepper .current')).toContainText('04');
 if(isMobile) expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(3);
});
