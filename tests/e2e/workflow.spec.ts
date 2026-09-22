import {test,expect} from '@playwright/test';

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
 expect((await download).suggestedFilename()).toBe('ris-investment-assessment.json');
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
