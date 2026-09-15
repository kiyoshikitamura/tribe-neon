// One Fresh QA. Browser/session remain in memory. No token/storageState exports.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const out=resolve('outputs/raid-fixes-live');fs.mkdirSync(out,{recursive:true});
const commandFile=out+'/b-command.txt';
if(process.argv.includes('--gate-selftest')){
 const testGate=out+'/b-gate-selftest.txt';fs.writeFileSync(testGate,'LOCAL_ONLY');await new Promise(r=>setTimeout(r,50));if(fs.readFileSync(testGate,'utf8')!=='LOCAL_ONLY')throw Error('gate mismatch');fs.unlinkSync(testGate);console.log('PASS local file gate; no browser/Auth/network');process.exit(0);
}
const target=process.env.RAID_B_PREVIEW_URL;
if(process.env.RAID_B_READY!=='b7e523b7c4651a8682f5e182733604e5e463316d'||!target||!/^https:\/\/tribe-neon-[a-z0-9]+-kiyoshi-kitamura\.vercel\.app$/.test(target))throw Error('Parent READY and dedicated target required');
if(fs.existsSync(commandFile))throw Error('Stale command file; inspect before starting');
const manifest=out+'/b-actor.json';if(fs.existsSync(manifest))throw Error('Actor attempt exists; never auto-create another');
fs.writeFileSync(manifest,JSON.stringify({state:'AUTH_NOT_YET_CONFIRMED',noAutomaticRetry:true,source:process.env.RAID_B_READY,target,at:new Date().toISOString()},null,2));
const {chromium}=createRequire(resolve('../game03-tribe-neon-raid-preview-step5/package.json'))('@playwright/test');
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();const calls=[];
page.on('response',async r=>{try{const u=new URL(r.url());if(u.hostname!=='sufvuqdnqohpfzkwxohq.supabase.co')return;const item={path:u.pathname,method:r.request().method(),status:r.status()};if(!r.ok()){try{const d=await r.json();if(typeof d.code==='string')item.code=d.code;}catch{}}calls.push(item);fs.writeFileSync(out+'/b-http.json',JSON.stringify(calls,null,2));if(u.pathname==='/auth/v1/signup'&&r.ok()){const d=await r.json();const id=d.user?.id;if(id){fs.writeFileSync(manifest,JSON.stringify({state:'AUTH_CREATED',userId:id,isAnonymous:d.user.is_anonymous,source:process.env.RAID_B_READY,target,at:new Date().toISOString(),noAutomaticRetry:true},null,2));console.log('QA_ACTOR '+id);}}}catch{console.log('SAFE_RESPONSE_CAPTURE_FAILED');}});
try{
 await page.goto(target);await page.getByRole('button',{name:'TAP TO START',exact:true}).click();await page.getByRole('button',{name:'はじめから',exact:true}).click();await page.getByRole('button',{name:'SKIP',exact:true}).waitFor({timeout:30000});console.log('AUTH_READY_SETUP_PAUSED');
 // Reviewed local UI actions are supplied through this file. Do not place secrets in commands/results.
 while(true){await new Promise(r=>setTimeout(r,500));if(!fs.existsSync(commandFile))continue;const command=fs.readFileSync(commandFile,'utf8');fs.unlinkSync(commandFile);try{if(command.trim()==='STOP')break;await eval(command);console.log('ACTION_COMPLETE');}catch(e){console.log('ACTION_FAILED '+e.name);}}
}finally{await context.close();await browser.close();console.log('B_CONTEXT_CLOSED');}
