import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium, webkit} from '@playwright/test';
const require=createRequire(path.resolve('scratch/announcement-test-runtime/package.json'));
const {build}=require('esbuild');
const out=path.resolve('scratch/character-visual-ui'); fs.mkdirSync(out,{recursive:true});
const context=`import React from 'react';
import {CHARACTERS_MASTER} from './src/utils/game_constants';
import {CANONICAL_SKILL_VIEW} from './src/utils/skills_master_data';
import {CANONICAL_EQUIPMENT_VIEW} from './src/utils/equipments_master_data';
const Context=React.createContext(null); export const useGame=()=>React.useContext(Context);
export function Provider({children}){
const masters=[...CHARACTERS_MASTER].sort((a,b)=>Number(b.name==='ageha')-Number(a.name==='ageha'));
const chars=masters.map((m,i)=>({id:'owned-'+i,character_id:m.id,level:42,awakening_level:i%6,awakening_progress:0}));
const [selected,setSelected]=React.useState(chars[0].character_id);
const [selectedSkill,setSelectedSkill]=React.useState(null);const [selectedEquipment,selectUpgradeEquipment]=React.useState(null);
window.fixtureChars=chars;window.fixtureMasters=masters;
const equipment=CANONICAL_EQUIPMENT_VIEW.slice(0,7).map((m,i)=>({id:'gear-'+i,equipment_id:m.id,equipped_character_id:chars[0].id,slot_index:i,level:1,plus_val:0}));
const skills=CANONICAL_SKILL_VIEW.slice(0,6).map((m,i)=>({id:'skill-'+i,skill_card_id:m.id,equipped_character_id:chars[0].id,slot_index:i,level:1,plus_val:0}));
return <Context.Provider value={{session:{user:{id:'fixture'}},inventoryProjectionOwnerUserId:'fixture',userCharactersDbList:chars,identityLeaderCharacterId:chars[0].character_id,upgradeSelectedCharId:selected,setUpgradeSelectedCharId:setSelected,userEquipmentsList:equipment,userSkillsList:skills,selectedMembers:chars.slice(0,5).map(c=>c.character_id),selectedSkill,setSelectedSkill,selectedEquipment,selectUpgradeEquipment,playCyberSe:()=>{},setGlobalInteractionBlocking:()=>{},charExpS:0,awakeningBooks:0}}>{children}</Context.Provider>;
}`;
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {Provider} from 'game-fixture';import Character from './src/app/components/character/CharacterSystemV2';createRoot(document.getElementById('root')).render(<Provider><Character/></Provider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:path.join(out,'app.js'),plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/GameContext$|^game-fixture$/},()=>({path:'context',namespace:'fixture'}));
 b.onResolve({filter:/^@\/utils\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='context'?context:`export const supabase={rpc:async()=>({data:{characters:window.fixtureChars.slice(0,5)},error:null})};`,loader:'tsx',resolveDir:process.cwd()}));
}}]});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"><div id="root" class="app-container" style="max-width:480px;margin:auto"></div><script src="/app.js"></script>');return;}
 const file=url.pathname==='/globals.css'?path.resolve('src/app/globals.css'):['/app.js','/app.css'].includes(url.pathname)?path.join(out,path.basename(url.pathname)):path.join('public',decodeURIComponent(url.pathname));
 if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const results=[];
try {for(const [name,engine,viewport] of [['pc',chromium,{width:1280,height:900}],['mobile',webkit,{width:390,height:844}],['small',webkit,{width:375,height:667}],['wide',webkit,{width:430,height:932}]]){
 const browser=await engine.launch({headless:true});try{
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const check=async(label)=>{await page.waitForFunction(()=>[...document.querySelectorAll('.character-presentation')].every(e=>e.classList.contains('is-visual-ready')));await page.waitForFunction(()=>[...document.querySelectorAll('img.character-status-badge')].every(i=>i.complete&&i.naturalWidth>0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' horizontal overflow');await page.screenshot({path:path.join(out,name+'-'+label+'.png'),fullPage:true});};
 await page.locator('.character-home-art .is-visual-ready').waitFor();
 const art=await page.locator('.character-home-art').boundingBox();const portrait=await page.locator('.character-home-art .character-presentation-character').boundingBox();assert.ok(portrait.height/art.height>2.7);await check('home');
 if(name==='pc'){
 const gallery=[];
 for(let i=0;i<60;i++){
 await page.locator('.character-home-art .is-visual-ready').waitFor();await page.waitForFunction(()=>document.querySelector('.character-home-art .character-presentation-character')?.naturalWidth>0);
 const label=await page.locator('.character-home-identity h1').textContent();const shot=await page.locator('.character-home-art').screenshot();gallery.push('<div><img width="190" src="data:image/png;base64,'+shot.toString('base64')+'"><p>'+label+'</p></div>');await page.getByRole('button',{name:'次のキャラクター',exact:true}).click();
 }
 const sheet=await browser.newPage({viewport:{width:1200,height:1000}});await sheet.setContent('<body style="margin:0;background:#111;color:white;display:grid;grid-template-columns:repeat(6,1fr);gap:8px">'+gallery.join('')+'</body>');await sheet.screenshot({path:path.join(out,'all-character-crops.png'),fullPage:true});await sheet.close();
 }

 await page.getByRole('button',{name:'次のキャラクター',exact:true}).click();await page.locator('.character-home .is-awakening').waitFor();await check('awakened-home');
 await page.getByRole('button',{name:'前のキャラクター',exact:true}).click();
 await page.getByRole('button',{name:'育成する',exact:true}).click();await check('growth');
 await page.getByRole('button',{name:'覚醒',exact:true}).click();await page.getByText('未覚醒',{exact:true}).waitFor();await check('awakening');
 await page.getByRole('button',{name:'スキル',exact:true}).last().click();await check('skills');
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('button',{name:/^装備/}).click();assert.equal(await page.locator('.character-equipment-slot').count(),7);await check('equipment');
 await page.getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('button',{name:/^パーティ/}).click();await page.locator('.character-party-leader .character-status-badge').first().waitFor();await check('party');
 await page.getByRole('button',{name:'メンバー変更',exact:true}).click();await page.locator('.character-party-draft-slots button').first().click();await check('party-candidates');
 await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'キャラホームへ戻る',exact:true}).click();await page.getByRole('button',{name:'キャラ一覧',exact:true}).click();await check('list');
 const levels=await page.locator('.character-v2-character-grid .is-awakening').evaluateAll(images=>[...new Set(images.map(i=>i.alt))]);assert.equal(levels.length,5);
 assert.equal(errors.length,0,errors.join('\n'));results.push({name,status:'PASS',awakeningLevels:levels.length});
 }finally{await browser.close();}
}fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{server.close();}
