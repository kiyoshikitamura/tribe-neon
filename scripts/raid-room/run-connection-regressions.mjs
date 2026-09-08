import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const dir='docs/development/evidence/raid-room-connection-20260908';
fs.mkdirSync(dir,{recursive:true});
const tests=fs.readdirSync('tests/raid-room').filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/raid-room/'+x);
const runs=[['room-contracts',['--test',...tests]],...['verify_canonical_battle_runtime','verify_battle_full_skill_load_fixture','audit_battle_ai_full_skill_load','verify_battle_presentation_contract','verify_battle_mvp_result'].map(x=>[x,['--experimental-strip-types',`scripts/${x}.mjs`]]),...fs.readdirSync('tests/raid-room').filter(x=>/^run-.*-tests.mjs$/.test(x)).map(x=>[x,['tests/raid-room/'+x]])];
const results=[];
for(const [name,args]of runs){const r=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,RAID_TEST_RUNTIME_DIR:fs.realpathSync('outputs/raid-test-runtime')},maxBuffer:20e6});fs.writeFileSync(`${dir}/${name}.log`,r.stdout+'\n'+r.stderr);results.push({name,exit:r.status,passed:[...r.stdout.matchAll(/(?:ℹ|#) pass (\d+)/g)].map(m=>Number(m[1]))});if(r.status!==0)break;}
fs.writeFileSync(`${dir}/regressions.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));if(results.some(x=>x.exit!==0))process.exit(1);
