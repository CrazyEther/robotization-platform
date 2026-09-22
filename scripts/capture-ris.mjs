/* global process, console */
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
try{
 await page.goto(process.env.RIS_PREVIEW_URL??'http://127.0.0.1:8890/');
 await page.getByRole('button',{name:'Создать проект'}).first().click();
 await page.getByRole('button',{name:'Перейти к роботам'}).click();
 await page.getByRole('textbox',{name:'Поиск роботов'}).fill('MiR250');
 await page.screenshot({path:'docs/design/ris-marketplace.png',fullPage:true});
 await page.getByRole('button',{name:/Добавить в транспортный сценарий/}).click();
 await page.screenshot({path:'docs/design/ris-layout.png',fullPage:true});
 await page.getByRole('button',{name:'Настроить симуляцию'}).click();
 await page.getByRole('button',{name:'Запустить модель'}).click();
 await page.getByText('SIMPY · РЕЗУЛЬТАТ').waitFor({timeout:20000});
 await page.screenshot({path:'docs/design/ris-simulation.png',fullPage:true});
 await page.getByRole('button',{name:'Перейти к инвестициям'}).click();
 await page.screenshot({path:'docs/design/ris-economics.png',fullPage:true});
 console.log('Captured 4 actual browser views of the coherent RIS workflow.');
}finally{await browser.close();}
