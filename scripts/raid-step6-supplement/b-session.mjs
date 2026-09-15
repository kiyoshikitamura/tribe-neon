// One dedicated anonymous QA only. Session stays in memory/browser; no storageState export.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const {chromium}=createRequire(resolve('../game03-tribe-neon-raid-preview-step5/package.json'))('@playwright/test');
const out='outputs/raid-step6-supplement';fs.mkdirSync(out,{recursive:true});
const attempt=process.env.RAID_B_ATTEMPT??'1';
if(!/^[1-2]$/.test(attempt))throw Error('Unexpected attempt');
const manifest=out+(attempt==='1'?'/b-actor.json':'/b-actor-2.json');
if(fs.existsSync(manifest))throw Error('Actor attempt exists; do not create another');
fs.writeFileSync(manifest,JSON.stringify({state:'AUTH_NOT_YET_CONFIRMED',noAutomaticRetry:true,at:new Date().toISOString()},null,2));
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();
const calls=[];
page.on('response',async r=>{const u=new URL(r.url());if(u.hostname!=='sufvuqdnqohpfzkwxohq.supabase.co')return;calls.push({path:u.pathname,status:r.status()});if(u.pathname==='/auth/v1/signup'&&r.ok()){const d=await r.json();const id=d.user?.id;if(id){fs.writeFileSync(manifest,JSON.stringify({state:'AUTH_CREATED',userId:id,isAnonymous:d.user.is_anonymous,at:new Date().toISOString(),noAutomaticRetry:true},null,2));console.log('QA_ACTOR '+id);}}});
await page.goto('https://tribe-neon-gcg8o8bcu-kiyoshi-kitamura.vercel.app');
await page.getByRole('button',{name:'TAP TO START',exact:true}).click();
await page.getByRole('button',{name:'はじめから',exact:true}).click();
await page.getByRole('button',{name:'SKIP',exact:true}).waitFor({timeout:30000});
console.log('AUTH_READY_SETUP_PAUSED');
// Commands are reviewed local browser actions. Never place credentials in commands or results.
const commandFile=out+'/b-command.txt';
while(true){await new Promise(r=>setTimeout(r,500));if(!fs.existsSync(commandFile))continue;const command=fs.readFileSync(commandFile,'utf8');fs.unlinkSync(commandFile);try{if(command.trim()==='STOP'){await browser.close();break;}await eval(command);console.log('ACTION_COMPLETE');}catch(e){console.log('ACTION_FAILED '+e.name);}}
