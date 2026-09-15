import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='docs/development/evidence/raid-step4/result';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:3016/qa/raid-pages');await page.getByLabel('検証画面').selectOption('full-result');const report=[];
for(const [width,height] of [[375,844],[390,844],[430,844],[390,600]]){
 await page.setViewportSize({width,height});
 for(const scenario of ['owner','member','cleared','expired']){
  await page.getByLabel('Mockシナリオ').selectOption(scenario);await page.getByRole('region',{name:'レイド戦績'}).waitFor();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{}))));await page.waitForTimeout(1000);
  const scroll=page.locator('.ui-hub-page-scroll');await scroll.evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${out}/${scenario}-${width}x${height}-top.png`,animations:'disabled'});assert.equal(await page.locator('.sf-mvp').count(),1);
  await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:`${out}/${scenario}-${width}x${height}-bottom.png`,animations:'disabled'});const button=page.getByRole('button',{name:'レイドへ戻る',exact:true});const hit=await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.ok(hit);await button.click();assert.equal(await page.getByTestId('qa-action').textContent(),'ack-return');
  const size=await page.locator('.ui-hub-page-content').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.scroll<=size.client+1);report.push({width,height,scenario,size});
 }
}
assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify({report,errors,mvp:'PASS',continueControl:'PASS',scope:'real BattleResultSummary + Mock receipt; actual ack RPC is covered by existing regressions'},null,2));await browser.close();console.log('PASS full Result/MVP/receipt/continueControl 16 state-viewports.');
