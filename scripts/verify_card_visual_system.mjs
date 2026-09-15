import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {PNG} from 'pngjs';
const base='edb560c1b30bbbbd035622b5e35fff5f32eab7bf';
const rows=JSON.parse(fs.readFileSync('docs/development/card-visual-integration/gate2-production-metadata.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(rows.length,26);assert.equal(new Set(rows.map(r=>r.sha256)).size,22);
let alpha;
for(const row of rows){const bytes=fs.readFileSync(row.path);assert.equal(sha(bytes),row.sha256,row.path);const png=PNG.sync.read(bytes);assert.equal(png.width,row.width);assert.equal(png.height,row.height);assert.equal(bytes[25],6,'RGBA color type');assert(png.data.some((v,i)=>i%4===3&&v===0),'transparent background');if(row.group==='Character'){const current=Buffer.from(png.data.filter((_,i)=>i%4===3));if(alpha)assert.deepEqual(current,alpha,'common Character alpha / opening');alpha=current;}}
for(const r of ['n','r','sr','ssr'])assert.equal(sha(fs.readFileSync('public/ui/rarity/skill-frame-'+r+'.png')),sha(fs.readFileSync('public/ui/rarity/equipment-frame-'+r+'.png')));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('diff',base,'--name-only','--','public/frames','public/ui/rarity/n.png','public/ui/rarity/r.png','public/ui/rarity/sr.png','public/ui/rarity/ssr.png','supabase','src/constants','src/domain/gameplay/canonical','src/utils/rarityAssets.ts','src/utils/attributeAssets.ts','src/app/context','src/app/components/gacha','src/app/components/raid'),'');
const changed=git('diff',base,'--name-only','--','public').split('\n').filter(Boolean);assert.deepEqual(changed.sort(),rows.map(r=>r.path).sort());
const modal=fs.readFileSync('src/app/components/CommonModals.tsx','utf8');assert(!modal.includes('getAwakeningBadgeAsset'));assert(modal.includes('<b>+{assetProgressionLevel(res)}</b>'));
const previous=git('show',base+':src/app/components/CommonModals.css');const current=fs.readFileSync('src/app/components/CommonModals.css','utf8');for(const line of previous.split('\n').filter(l=>l.startsWith('.tutorial-gacha')))assert(current.includes(line),'Legacy Reveal CSS preserved');
assert(!fs.readFileSync('src/app/globals.css','utf8').includes('scale(1.319)'));
console.log(JSON.stringify({status:'PASS',base,productionPng:26,designs:22,sharedItemPairs:4,characterAlpha:'IDENTICAL',sourceMappings:'UNCHANGED',dbMaster:'UNCHANGED',legacyAssets:'UNCHANGED',newGachaSource:'UNCHANGED',legacyRevealCss:'PRESERVED'},null,2));
