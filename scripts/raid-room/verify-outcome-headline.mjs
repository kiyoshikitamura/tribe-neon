import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const out='outputs/raid-outcome-header';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:3027/qa/raid-pages');
 await page.getByLabel('検証画面').selectOption('full-result');
 const checks=[];
 for(const width of [375,390,430]) {await page.setViewportSize({width,height:844});
  for(const [scenario,title] of [['cleared','討伐成功'],['member','戦闘終了'],['expired','開催終了']]){
   await page.getByLabel('Mockシナリオ').selectOption(scenario);
   await page.getByRole('heading',{name:title,exact:true}).waitFor();
   if(scenario==='cleared'){assert.equal(await page.locator('.raid-result-details__states').innerText().then(t=>t.includes('敗北')&&t.includes('撃破済み')),true);assert.equal(await page.locator('.battle-result-summary').getAttribute('data-result-winner'),'ENEMY');}
   assert.equal(await page.getByRole('heading',{name:/LOSE|DEFEAT/}).count(),0);
   await page.getByRole('button',{name:'レイドへ戻る',exact:true}).click();assert.equal(await page.getByTestId('qa-action').textContent(),'ack-return');
   checks.push({width,scenario,title,pass:true});
   if(scenario==='cleared'&&width===390)await page.screenshot({path:out+'/cleared-personal-defeat.png'});
  }
 }
 await page.getByLabel('検証画面').selectOption('header');
 for(const width of [375,390,430]){await page.setViewportSize({width,height:844});for(const [scenario,rp] of [['owner',5],['member',2],['cleared',0]]){await page.getByLabel('Mockシナリオ').selectOption(scenario);await page.getByLabel(`レイドポイント ${rp}/5`,{exact:true}).waitFor();const size=await page.locator('.header-mobile').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert.ok(size.scroll<=size.client+1);checks.push({width,rp,header:true,pass:true});}if(width===390)await page.screenshot({path:out+'/header-rp.png'});}
 fs.writeFileSync(out+'/result.json',JSON.stringify({scope:'Actual BattleResultSummary and Header, synthetic finalized receipt and resource balances. No live battles or DB writes.',checks},null,2));console.log('PASS 9 result + 9 Header cases, personal ENEMY/shared clear, return and 5→2→0 RP');
}finally{await browser.close();}
