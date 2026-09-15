import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const url = process.env.RAID_TOP_QA_URL || 'http://127.0.0.1:3013/qa/raid-top';
const out = 'docs/development/evidence/raid-top-step1-20260909';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url);
const report=[];
for(const scenario of ['single','multiple','empty','loading','error','unavailable','ended','long-name','no-guild','broken-image','unknown','returned']) {
 await page.getByLabel('Mockシナリオ',{exact:true}).selectOption(scenario);
 if(scenario==='loading')await page.getByRole('status',{name:'通信中'}).first().waitFor();else await page.getByTestId('raid-top').waitFor({timeout:30000});
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('.ui-hub-page-scroll').evaluate(el=>el.scrollTop=0);
 const titleBox=await page.getByRole('heading',{name:'レイド',exact:true}).boundingBox();assert.ok(titleBox&&titleBox.width<=1&&titleBox.height<=1,'large title hidden');
 const product=page.getByTestId('top-product');
 const dimensions=await product.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,document:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert.ok(dimensions.scroll<=dimensions.client+1,JSON.stringify({scenario,...dimensions}));
 const buttons=await product.locator('button').evaluateAll(els=>els.map(el=>({text:el.textContent,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
 assert.ok(buttons.every(b=>b.width>=44&&b.height>=44),JSON.stringify({scenario,buttons}));
 await page.screenshot({path:`${out}/top-${scenario}-390.png`,fullPage:false});
 if(await page.getByRole('region',{name:'仲間からの救援'}).count()){ await page.getByRole('region',{name:'仲間からの救援'}).evaluate(el=>el.scrollIntoView({block:'start'})); await page.screenshot({path:`${out}/top-${scenario}-rescue-390.png`,fullPage:false}); }
 await page.locator('.ui-hub-page-scroll').evaluate(el=>el.scrollTop=el.scrollHeight); await page.screenshot({path:`${out}/top-${scenario}-lower-390.png`,fullPage:false});
 if(scenario!=='loading'){const hit=await page.getByRole('button',{name:/開催中のレイドを探す/}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.ok(hit,'browse CTA footer overlap: '+scenario);}
 report.push({scenario,dimensions,buttons});
}
await page.getByLabel('Mockシナリオ',{exact:true}).selectOption('multiple');await page.getByTestId('raid-top').waitFor();
await page.getByRole('button',{name:'救援に向かう'}).first().click();await page.getByRole('dialog').waitFor();assert.match(await page.getByTestId('last-navigation').textContent(),/qa-top-rescue-0.*qa-rescue-reference-0/);await page.getByRole('button',{name:'戻る',exact:true}).click();
await page.getByLabel('Mockシナリオ',{exact:true}).selectOption('empty');await page.getByTestId('raid-top').waitFor();await page.getByRole('button',{name:'挑む',exact:true}).first().click();await page.getByRole('dialog').waitFor();assert.match(await page.getByTestId('last-navigation').textContent(),/^choose:RAID_/);await page.getByRole('button',{name:'戻る',exact:true}).click();
for(let i=0;i<7;i++){await page.getByLabel('素材エリア',{exact:true}).selectOption(String(i));await page.getByTestId('raid-top').waitFor();await page.screenshot({path:`${out}/top-area-${i+1}-390.png`,fullPage:false});}
await page.getByLabel('Mockシナリオ',{exact:true}).selectOption('single');await page.getByTestId('raid-top').waitFor();await page.getByRole('button',{name:'戦闘帰還Mock'}).click();await page.getByTestId('raid-top').waitFor();assert.match(await page.getByTestId('top-product').textContent(),/22%/);
await page.setViewportSize({width:412,height:915});await page.screenshot({path:`${out}/top-returned-412.png`,fullPage:false});
assert.deepEqual(errors,[]);await writeFile(`${out}/browser-report.json`,JSON.stringify({url,report,errors,navigation:'PASS',returnRefresh:'PASS',areaMaterials:7},null,2));
await browser.close();console.log('Raid top browser QA PASS: 12 scenarios, 7 area materials, 390/412px, navigation, return refresh.');
