import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,webkit} from '@playwright/test';
const require=createRequire(path.resolve('scratch/announcement-test-runtime/package.json'));
const {build}=require('esbuild');
const source=fs.readFileSync('src/app/components/HomeTab.tsx','utf8').replaceAll('\r\n','\n');
// Exercise the actual navigation, rotation, master-loading effects and JSX.
const logic=source.slice(source.indexOf('  const openBanner ='),source.indexOf('  useEffect(() => {\n    if (qaState?.funnelMilestones)'));
const markup=source.slice(source.indexOf('{visibleBanners.length > 0 && <div className="mypage-event-banner-area">'),source.indexOf('{/* 4. 1行チャット'));
const out=path.resolve('scratch/banner-ui');fs.mkdirSync(out,{recursive:true});
await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
import React,{useState,useRef,useEffect} from 'react';import{createRoot}from'react-dom/client';
type HomeBanner={id:string,title:string,img:string|null,destination:string|null,eventId?:string};
const qaState=null,session={user:{id:'fixture'}},featureOperatingStates={},PRODUCTION_MY_PAGE_CREATIVES=[];
const resolvePresentableAssetUrl=x=>x,isDestinationAvailable=()=>true,getJstDateString=()=>'',playCyberSe=()=>{};
const setMissionTab=()=>{},setShowMissionPanel=()=>{},setGuildRankingVisualReady=()=>{},setShowGuildRankingCampaign=()=>{},setDmRecipientId=()=>{},setChatChannel=()=>{},setShowTribeChatPanel=()=>{};
function navigateTab(tab){window.destination=tab;}
const supabase={rpc:async(name)=>({data:name==='get_active_mission_events'?[{event_id:'GVG_PREP_20260904',is_progress_active:true}]:[],error:null}),from:()=>({select:()=>({eq:async()=>({data:window.releaseRows,error:null})})})};
const preloadAndDecodeHomeImage=src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=src;});
function App(){const[banners,setBanners]=useState<HomeBanner[]>([]),[bannerIndex,setBannerIndex]=useState(0);
const visibleBanners=banners,activeBannerIndex=banners.length?bannerIndex%banners.length:0;
const lastBannerImpression=useRef(null),bannerAuthorityKeyRef=useRef('');
${logic}
return <div className="mypage-lower-content">${markup}</div>;
}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,outfile:path.join(out,'app.js')});
const row={id:'raid_battle_major_update',title:'レイドバトル大幅アップデート',image_url:'/promotion/mypage_banner_raid_update.webp',destination_value:'raid'};
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/home.css"><div id="root" style="width:100%;max-width:430px;margin:auto"></div><script>window.releaseRows=${JSON.stringify([row])}</script><script src="/app.js"></script>`);return;}
 const file=req.url==='/globals.css'?'src/app/globals.css':req.url==='/home.css'?'src/app/components/HomeTab.css':req.url==='/app.js'?path.join(out,'app.js'):path.join('public',req.url.split('?')[0]);
 if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'image/webp');res.end(fs.readFileSync(file));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const [name,engine,width,height]of[['pc',chromium,1280,900],['mobile',webkit,390,844]]){
 const browser=await engine.launch();try{const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.querySelectorAll('.banner-dots .dot').length===3);
 assert.equal(await page.locator('.banner-card').getAttribute('data-banner-id'),'gvg-prep');
 await page.locator('.banner-arrow.right').click();assert.equal(await page.locator('.banner-card').getAttribute('data-banner-id'),'guild-power-ranking');
 await page.locator('.banner-arrow.right').click();assert.equal(await page.locator('.banner-card').getAttribute('data-banner-id'),row.id);
 await page.locator('.banner-card').click();assert.equal(await page.evaluate(()=>window.destination),'raid');
 const image=page.locator('.banner-card img');assert.equal(await image.evaluate(e=>getComputedStyle(e).objectFit),'contain');
 assert.equal(await image.evaluate(e=>e.naturalWidth),1160);assert.equal(await image.evaluate(e=>e.naturalHeight),480);
 await page.screenshot({path:path.join(out,name+'.png')});
 await page.waitForFunction(()=>document.querySelector('.banner-card')?.getAttribute('data-banner-id')==='gvg-prep',{},{timeout:6000});
 await page.evaluate(()=>{window.releaseRows=[];document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForFunction(()=>document.querySelectorAll('.banner-dots .dot').length===2);
 await page.evaluate(row=>{window.releaseRows=[{...row,image_url:'/missing.webp'}];document.dispatchEvent(new Event('visibilitychange'));},row);
 await page.waitForTimeout(300);assert.equal(await page.locator('.banner-dots .dot').count(),2);
 console.log(name+': PASS existing order, 3 banners, rotation, Raid tap, contain, hide, broken asset isolation');
 }finally{await browser.close();}
}}finally{server.close();}
