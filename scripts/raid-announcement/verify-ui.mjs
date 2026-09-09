import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,webkit} from '@playwright/test';
import {announcement} from './release.mjs';
const require=createRequire(path.resolve('scratch/announcement-test-runtime/package.json'));
const {build}=require('esbuild');
const out=path.resolve('scratch/announcement-ui'); fs.mkdirSync(out,{recursive:true});
const context=`import React from 'react';
const Context=React.createContext(null); export const useGame=()=>React.useContext(Context);
export function Provider({children}){
const [showInboxPanel,setShowInboxPanel]=React.useState(true);
const [newsList,setNewsList]=React.useState([]);
const [inboxPanelTab,setInboxPanelTab]=React.useState('news');
window.openNews=()=>setShowInboxPanel(true);
return <Context.Provider value={{showInboxPanel,setShowInboxPanel,newsList,setNewsList,inboxPanelTab,setInboxPanelTab,presents:[],playCyberSe:()=>{},presentClaimLoading:false}}>{children}</Context.Provider>;
}`;
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {Provider} from 'game-fixture';import Inbox from './src/app/components/InboxPanel';createRoot(document.getElementById('root')).render(<Provider><Inbox/></Provider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:path.join(out,'app.js'),plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/GameContext$|^game-fixture$/},()=>({path:'context',namespace:'fixture'}));
 b.onResolve({filter:/^@\/utils\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='context'?context:`export const supabase={from:()=>({select:()=>({order:()=>Promise.resolve({data:window.newsRows,error:null})})})};`,loader:'tsx',resolveDir:process.cwd()}));
}}]});
const server=http.createServer((req,res)=>{
 if(req.url==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"><div id="root" class="app-container" style="position:relative;height:100dvh"></div><script>window.newsRows=${JSON.stringify([{id:1,category:'INFO',...announcement,start_at:'2026-09-09T15:00:00Z'}])}</script><script src="/app.js"></script>`);return;}
 const file=req.url==='/globals.css'?path.resolve('src/app/globals.css'):path.join(out,path.basename(req.url));
 if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const results=[];
try {for(const [name,engine,viewport] of [['pc',chromium,{width:1280,height:900}],['mobile',webkit,{width:390,height:844}],['small-mobile',webkit,{width:320,height:568}]]){
 const browser=await engine.launch({headless:true});try{
 const page=await browser.newPage({viewport, reducedMotion: 'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByText(announcement.title,{exact:true}).click();
 const dialog=page.getByRole('dialog',{name:announcement.title}); await dialog.waitFor();
 assert.equal(await dialog.locator('.inbox-news-modal-text').textContent(),announcement.content);
 const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1);
 assert.equal(await dialog.locator('.inbox-news-modal-text').evaluate(e=>getComputedStyle(e).whiteSpace),'pre-wrap');
 await dialog.locator('.canonical-dialog-body').evaluate(e=>{e.scrollTop=e.scrollHeight;});
 const footerBounds=await dialog.locator('.canonical-dialog-actions').boundingBox(); console.log(name, JSON.stringify({bounds,footerBounds})); assert.ok(footerBounds.y+footerBounds.height<=viewport.height+1); await page.screenshot({path:path.join(out,`${name}.png`)});
 await dialog.getByRole('button',{name:'閉じる',exact:true}).last().click();
 await page.getByRole('dialog',{name:'受信箱'}).getByRole('button',{name:'閉じる',exact:true}).click();
 await page.evaluate(()=>{window.newsRows=[];window.openNews();});
 await page.getByText('お知らせはありません',{exact:true}).waitFor();assert.equal(errors.length,0);
 results.push({name,status:'PASS',checks:'list/detail, verbatim copy, wrapping, viewport, scroll, close/reopen refresh'});
 }finally{await browser.close();}
}console.log(JSON.stringify({results,scope:'Actual InboxPanel and CSS; mocked data/context, not live Auth or Realtime'},null,2));
}finally{server.close();}
