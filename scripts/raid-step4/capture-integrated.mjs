import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out='docs/development/evidence/raid-step4/integrated';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
async function ready(){await page.waitForFunction(()=>document.querySelectorAll('.spinner').length===0);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>Promise.all(Array.from(document.images).map(image=>image.decode().catch(()=>{}))));}
async function shot(name){await ready();await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});}
const report=[];
for(const [width,height] of [[375,844],[390,844],[430,844],[390,600]]){
 await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:3016/qa/raid-pages');await page.getByLabel('検証画面').selectOption('integrated');await ready();
 await shot(`list-${width}x${height}`);assert.equal(await page.getByRole('button',{name:'戦況を見る',exact:true}).count(),20);assert.equal(await page.getByTestId('qa-action').textContent(),'list:beginner:0');
 await page.getByRole('button',{name:'次へ',exact:true}).click();await ready();assert.equal(await page.getByRole('button',{name:'戦況を見る',exact:true}).count(),1);assert.equal(await page.getByTestId('qa-action').textContent(),'list:beginner:20');await shot(`list-next-${width}x${height}`);
 await page.getByRole('button',{name:'挑む',exact:true}).click();await ready();await page.getByRole('group',{name:'本日の挑戦先'}).getByRole('button').last().click();await ready();assert.ok(!(await page.getByTestId('qa-action').textContent()).startsWith('create:'));
 await page.locator('.ui-hub-page-scroll').evaluate(el=>el.scrollTop=0);await shot(`selection-${width}x${height}-top`);
 await page.getByRole('button',{name:'敵情報を見る',exact:true}).click();await page.getByRole('dialog',{name:'敵情報'}).waitFor();await shot(`enemy-${width}x${height}-top`);assert.equal(await page.getByRole('dialog').count(),1);
 const body=page.locator('.raid-room-dialogs .canonical-dialog-body');await body.evaluate(el=>el.scrollTop=el.scrollHeight);await shot(`enemy-${width}x${height}-bottom`);assert.equal(await page.getByText('使用スキル未取得',{exact:true}).count(),0);await page.getByRole('dialog').getByRole('button',{name:'閉じる',exact:true}).last().click();
 await page.locator('.ui-hub-page-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);await shot(`selection-${width}x${height}-bottom`);await page.getByRole('button',{name:'この敵に挑む',exact:true}).click();await page.getByTestId('raid-room-detail').waitFor();await ready();assert.match(await page.getByTestId('qa-action').textContent(),/^create:/);await page.locator('.ui-hub-page-scroll').evaluate(el=>el.scrollTop=0);await shot(`created-${width}x${height}`);
 const size=await page.locator('.ui-hub-page-content').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.scroll<=size.client+1);report.push({width,height,size});
}
assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({report,errors,paging:'PASS',selectDoesNotCreate:'PASS',explicitCreate:'PASS',canonicalSkills:'PASS'},null,2));await browser.close();console.log('PASS real Browser list/paging/selection/enemy dialog/create return across 4 viewports.');
