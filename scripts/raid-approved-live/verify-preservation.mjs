import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const out='outputs/raid-approved-live',sha='59eea0414855bdadf36c8df4e30ad41ca10fa449',base='b7e523b7c4651a8682f5e182733604e5e463316d';
const paths=['src/app/context','src/hooks','src/domain','supabase','src/app/components/raid/RaidRoomDialogs.css','src/app/components/ui/CanonicalDialog.tsx','src/app/components/ui/CanonicalDialog.css'];
const changes=execFileSync('git',['diff','--name-only',base,sha,'--',...paths],{encoding:'utf8'}).trim();
const files=execFileSync('git',['diff','--name-only',base,sha,'--','public/ui/rarity'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const checkPaths=[...new Set([...files,...['n','r','sr','ssr'].map(x=>`public/ui/rarity/rarity-badge-${x}.png`),...['justice','order','evil','chaos'].map(x=>`public/ui/rarity/attribute-badge-${x}.png`)])];
const hash=b=>createHash('sha256').update(b).digest('hex');const deployment=JSON.parse(fs.readFileSync(`${out}/rest-deployment-attempt.json`));const assets=[];
for(const file of checkPaths){const r=await fetch(`https://${deployment.url}/${file.replace(/^public\//,'')}`);const bytes=Buffer.from(await r.arrayBuffer());const expected=execFileSync('git',['show',`${sha}:${file}`],{maxBuffer:8*1024*1024});assets.push({path:file,status:r.status,sha256:hash(bytes),matches:hash(bytes)===hash(expected)});}
const report={base,sha,protectedPaths:paths,changes:changes?changes.split(/\r?\n/):[],assets};fs.writeFileSync(`${out}/preservation-assets.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({protectedChanges:report.changes,assetCount:assets.length,failures:assets.filter(x=>x.status!==200||!x.matches)}));
