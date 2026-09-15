import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const root=process.cwd(),out=path.resolve('outputs/raid-step6-local-fixes/a-visual');
fs.mkdirSync(out,{recursive:true});
const runtime=path.resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14/outputs/raid-test-runtime');
const {build}=createRequire(path.join(runtime,'package.json'))('esbuild');
const {chromium}=createRequire(path.resolve('../game03-tribe-neon-raid-preview-step5/package.json'))('@playwright/test');
fs.writeFileSync(path.join(out,'entry.tsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import Selection from '${path.join(root,'src/app/components/raid/RaidEnemySelection').replaceAll('\\','/')}';
import {getRaidJoinRequirementMessage} from '${path.join(root,'src/domain/raidRoomJoinPresentation').replaceAll('\\','/')}';
const noop=()=>{};
createRoot(document.getElementById('root')!).render(<Selection choices={{status:'success',data:[{raidVariantId:'RAID_SHIBUYA_V1',name:'ハイスピード・スターズ'}]}} selectedVariantId="RAID_SHIBUYA_V1" difficultyId="intermediate" busy={false} onSelectVariant={noop} onSelectDifficulty={noop} onConfirm={noop} onCancel={noop} onRetry={noop} error={getRaidJoinRequirementMessage({status:'failed',reason:'below_minimum',actualPower:78228,minimumPower:160000})}/>);
`);
await build({entryPoints:[path.join(out,'entry.tsx')],outfile:path.join(out,'app.js'),bundle:true,platform:'browser',jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),nodePaths:[path.join(root,'node_modules')],plugins:[{name:'context-double',setup(b){b.onResolve({filter:/GameContext$/},()=>({path:'context',namespace:'double'}));b.onLoad({filter:/.*/,namespace:'double'},()=>({contents:'export const useGame=()=>({playCyberSe(){}});',loader:'js'}));}}]});
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let file;
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"><style>html,body{margin:0;background:#080d14;overflow:auto;height:auto}#root{padding:16px;max-width:390px;box-sizing:border-box}</style><div id="root"></div><script src="/app.js"></script>');}
  if(['/app.js','/app.css'].includes(url.pathname))file=path.join(out,url.pathname.slice(1));
  else if(url.pathname==='/globals.css')file=path.join(root,'src/app/globals.css');
  else {file=path.resolve(root,'public','.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.join(root,'public')+path.sep)){res.statusCode=403;return res.end();}}
  try{res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin);const alert=page.getByRole('alert');await alert.waitFor();
  await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode()));});
  await alert.scrollIntoViewIfNeeded();await page.waitForTimeout(200);
  const measured=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,text:document.querySelector('[role=alert]')?.textContent,images:[...document.images].map(i=>({loaded:i.complete&&i.naturalWidth>0}))}));
  assert.equal(measured.overflow,false);assert.ok(measured.images.every(i=>i.loaded));assert.match(measured.text,/160,000以上／現在の総合力：78,228/);
  await page.screenshot({path:path.join(out,'create-power-390.png')});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(measured,null,2));console.log('Local actual RaidEnemySelection: no overflow, images loaded, condition visible');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
