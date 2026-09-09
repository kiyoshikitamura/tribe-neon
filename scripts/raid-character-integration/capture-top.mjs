import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='docs/development/evidence/raid-character-integration/raid-top';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({reducedMotion:'reduce'});const report=[];
await page.goto('http://127.0.0.1:3015/qa/raid-top');
for(const [width,height] of [[375,844],[390,844],[430,844],[390,600]]){
 await page.setViewportSize({width,height});await page.getByLabel('Mockシナリオ',{exact:true}).selectOption('single');await page.getByTestId('raid-top').waitFor();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{}))));
 const scroll=page.locator('.ui-hub-page-scroll');await scroll.evaluate(e=>e.scrollTop=0);await page.screenshot({path:out+'/top-'+width+'-'+height+'.png',animations:'disabled'});const size=await page.locator('.ui-hub-page-content').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(size.scroll<=size.client+1);await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:out+'/bottom-'+width+'-'+height+'.png',animations:'disabled'});report.push({width,height,size});
}
await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log('Top viewport matrix PASS');
