import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
const production=process.env.RUN_PRODUCTION_SMOKE==='1';
const target=process.env.BATTLE_TOP_PREVIEW_URL;
if(production && target!=='https://www.tribe-neon.com') throw Error('Explicit Production domain required');
if(!production) process.loadEnvFile('../game03-tribe-neon-quest-cash-hotfix/.env.preview.local');
const ref=production?'ktpolnkyyfkowxdmijww':'sufvuqdnqohpfzkwxohq';
const api=production?'https://api.tribe-neon.com':process.env.NEXT_PUBLIC_SUPABASE_URL;
let apiKey=production?undefined:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const label=production?'production':'preview';
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:844},...(process.env.RESUME_HOME==='1'?{storageState:`scratch/normal-${label}-state.json`}:{})});
await page.addInitScript(()=>{
 window.__criticalBattle={normal:false,skill:false,impact:false,damage:false,defeat:false};
 const observer=new MutationObserver(()=>{
  const s=window.__criticalBattle,b=document.querySelector('.sb-root'); if(!b)return;
  s.normal ||= b.getAttribute('data-acceptance-state')==='B3' || !!b.querySelector('.sb-event')?.textContent?.includes('通常攻撃');
  s.skill ||= !!b.querySelector('.sb-announcement');
  s.impact ||= !!b.querySelector('.sb-effect');
  s.damage ||= !!b.querySelector('[data-battle-number="damage"]');
  s.defeat ||= !!b.querySelector('.defeated,.sb-ko');
 });
 observer.observe(document,{subtree:true,childList:true,attributes:true});
});
page.setDefaultTimeout(60000);
const steps=[],errors=[]; let session,completed=false;
const rpcEvidence=[];
page.on('response',async r=>{if(r.url().includes('/rpc/get_pvp_opponents_page') || r.url().includes('/rpc/start_pvp_battle'))rpcEvidence.push({rpc:r.url().split('/').at(-1),status:r.status(),request:r.request().postDataJSON(),response:await r.json()});});
const snapshot=async()=>{
 const s=await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>/^sb-.*-auth-token$/.test(k));return k?JSON.parse(localStorage.getItem(k)):null;});
 const c=createClient(api,apiKey,{auth:{persistSession:false,autoRefreshToken:false}});await c.auth.setSession({access_token:s.access_token,refresh_token:s.refresh_token});
 const {data:user,error}=await c.from('users').select('pvp_points').eq('id',s.user.id).single();if(error)throw error;
 const {data:ranks,error:re}=await c.rpc('get_public_pvp_rankings',{p_daily:true,p_limit:100,p_offset:0});if(re)throw re;const rank=ranks?.find(r=>r.user_id===s.user.id);
 return {userId:s.user.id,bp:user.pvp_points,rate:rank?.rank_points??1000};
};
let before,after;
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().startsWith(api))apiKey ||= r.headers().apikey;});
await page.addLocatorHandler(page.getByRole('dialog',{name:'ログインボーナス',exact:true}),async d=>{await d.getByRole('button',{name:'閉じる',exact:true}).click();});
await page.addLocatorHandler(page.getByRole('dialog',{name:'ギルドバトル準備ミッションのご案内',exact:true}),async d=>{await d.locator('.canonical-dialog-actions button').first().click();});
await page.addLocatorHandler(page.getByRole('dialog',{name:'ゲームデータを保護',exact:true}),async d=>{await d.getByRole('button',{name:'閉じる',exact:true}).click();});
await page.addLocatorHandler(page.locator('.canonical-dialog-overlay').filter({hasText:'ゲームデータを保護'}),async d=>{await d.getByRole('button',{name:'閉じる',exact:true}).click();});
const mark=async name=>{steps.push(name); console.log(name); await page.screenshot({path:`scratch/battle-top/normal-${label}-${name}.png`}); await page.context().storageState({path:`scratch/normal-${label}-state.json`});};
const button=name=>page.getByRole('button',{name,exact:true});
try {
 await page.goto(process.env.BATTLE_TOP_PREVIEW_URL);
 if(process.env.RESUME_HOME==='1') {
  await button('TAP TO START').click(); await button('続きから').click();
  await page.locator('.footer-mobile').waitFor();
 } else {
 await button('TAP TO START').click(); await button('はじめから').click();
 await page.locator('[data-world-stage="4"] .setup-world-tap').click();
 await page.locator('.setup-ageha-presentation .setup-primary-action').click();
 await page.getByPlaceholder('プレイヤー名を入力').fill('QA'+Date.now().toString(36).slice(-5));
 await button('この名前で始める').click();
 await page.locator('.tutorial-world').waitFor();
 session=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>/^sb-.*-auth-token$/.test(k));return key?JSON.parse(localStorage.getItem(key)):null;});
 await mark('world'); await page.locator('.tutorial-world button').click();
 await page.locator('.gacha-free-btn').click(); await page.locator('.cg-opening').click();
 for(let n=0;n<50 && !await page.locator('.cg-summary').isVisible();n++) {
  await page.waitForFunction(()=>['QUOTE','REVEAL','SETTLED','SUMMARY'].includes(document.querySelector('.cg-shell')?.getAttribute('data-stage')));
  if(await page.locator('.cg-summary').isVisible()) break;
  await page.locator('.cg-reveal').click(); await page.waitForTimeout(300);
 }
 await page.locator('.cg-summary').waitFor(); await mark('gacha');
 await page.locator('.cg-continue').click(); await button('育成へ進む').click();
 await button('Lv.7まで強化').click(); await page.getByRole('heading',{name:'レベルアップ結果'}).waitFor();
 await button('編成へ進む').click(); await page.locator('.char-party-auto-btn').click();
 await page.locator('[data-acceptance-state="AUTO_FORMATION_COMPLETE"]').getByRole('button',{name:'OK',exact:true}).click();
 await page.locator('[data-acceptance-state="Q1"] button').click();
 await page.locator('[data-acceptance-state="Q3"] button').click();
 await page.locator('[data-acceptance-state="Q5"] button').click();
 await page.locator('[data-acceptance-state="Q6"] button').click();
 await button('バトルスタート').waitFor(); await mark('ready'); await button('バトルスタート').click();
 await page.locator('.sb-root').waitFor(); await mark('battle');
 await page.locator('.battle-result-continue').waitFor({timeout:180000}); await mark('result');
 await page.locator('.battle-result-continue').click();
 await page.locator('.tutorial-rule-screen').waitFor();
 for(let n=0;n<5 && !await page.getByRole('dialog',{name:'ゲームデータを保存'}).isVisible();n++) {
  await page.locator('.tutorial-rule-screen button').click(); await page.waitForTimeout(350);
 }
 await button('そのまま続ける').click();
 await page.locator('.footer-mobile').waitFor(); await page.locator('.mypage-primary-cta').waitFor();
 for(const viewport of [{width:390,height:844},{width:412,height:915}]) {
  await page.setViewportSize(viewport); await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
  await mark('home-'+viewport.width);
 }
 }
 await page.locator('.circle-menu-btn.fight').click();
 await expect(page.locator('.battle-top-start')).toBeEnabled({timeout:60000});
 for(const viewport of [{width:390,height:844},{width:412,height:915}]) {
  await page.setViewportSize(viewport);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
  await expect(page.locator('.battle-top-comparison .battle-top-rate')).toHaveCount(2);
  await mark('battle-top-'+viewport.width);
 }
 const rivals=page.locator('.battle-top-rival');
 if(await rivals.count()>1) await rivals.nth(1).click();
 await expect(page.locator('.battle-top-start')).toBeEnabled();
 for(const kind of ['my','rival']) {
  await button(kind==='my'?'自分のデッキを見る':'相手のデッキを見る').click();
  const dialog=page.getByRole('dialog',{name:kind==='my'?'MY DECK':'RIVAL DECK',exact:true});
  await expect(dialog).toBeVisible(); await expect(dialog.locator('.pvp-deck-member').first()).toBeVisible();
  await mark(kind+'-deck'); await dialog.getByRole('button',{name:'閉じる',exact:true}).last().click();
 }
 await page.locator('.battle-top-start').click(); await button('バトルスタート').waitFor(); await mark('pvp-ready');
 before=await snapshot();console.log('BEFORE',JSON.stringify(before));
 await button('バトルスタート').click(); await page.locator('.sb-root').waitFor(); await mark('pvp-battle');
 if(await button('×1').isVisible()) await button('×1').click();
 await page.locator('.battle-result-continue').waitFor({timeout:240000}); await mark('pvp-result');
 after=await snapshot();console.log('AFTER',JSON.stringify(after));await expect(after.bp).toBe(before.bp-1);await expect(after.rate).not.toBe(before.rate);
 await writeFile(`scratch/battle-top/overflow-${label}-rpc.json`,JSON.stringify({before,after,rpcEvidence},null,2));
 await expect(page.locator('.battle-result-summary')).toContainText('MVP');
 await page.locator('.battle-result-continue').click();
 await expect(page.locator('.battle-top-hero').or(page.locator('.ranking-tab-view'))).toBeVisible({timeout:30000});
 if(await page.locator('.ranking-tab-view').isVisible()) {await button('マイページ').click();await page.locator('.circle-menu-btn.fight').click();}
 await page.locator('.battle-top-hero').waitFor();
 await mark('pvp-return');
 const battleEvidence=await page.evaluate(()=>window.__criticalBattle); console.log('BATTLE EVIDENCE',JSON.stringify(battleEvidence));
 for(const [kind,observed] of Object.entries(battleEvidence)) if(!observed)throw Error('Battle presentation not observed: '+kind);
 await page.reload(); await button('TAP TO START').click(); await button('続きから').click();
 await page.locator('.footer-mobile').waitFor(); await mark('reload');
 await writeFile(`scratch/battle-top/normal-${label}-critical-results.json`,JSON.stringify({status:'PASS',url:target,steps,errors,battleEvidence},null,2));
 completed=true;
 console.log('FRESH JOURNEY PASS');
} catch(e) {await mark('failure'); console.error((await page.locator('body').innerText()).slice(0,3000)); throw e;}
finally {
 session ||= await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>/^sb-.*-auth-token$/.test(k));return key?JSON.parse(localStorage.getItem(key)):null;}).catch(()=>null);
 await browser.close();
 if(completed && session?.access_token && apiKey) {const client=createClient(api,apiKey,{auth:{persistSession:false,autoRefreshToken:false}});await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token}); const {error}=await client.rpc('discard_current_anonymous_account_for_switch'); if(error) console.error('QA cleanup:',error.message);}
}
