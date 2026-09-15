import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
const out='outputs/raid-step5';mkdirSync(out,{recursive:true});
const domain=readdirSync('tests/raid-room').filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/raid-room/'+f);
const runners=['run-browser-tests','detail-run-tests','top-run-tests','top-data-run-tests','run-activity-sync-tests','run-clear-reward-tests','run-use-battle-room-tests','run-street-presentation-tests','run-ranking-retirement-tests','run-ui-cutover-tests','pages-run-tests','pages-rescue-hook-run-tests','pages-data-run-tests','integration-shared-run-tests'];
const commands=[['domain',['--test',...domain]],...runners.map(name=>[name,[`tests/raid-room/${name}.mjs`]]),['setup',['scripts/raid-step4/verify-setup-measurement.mjs']],['initial-equipment',['scripts/verify_initial_equipment_state.mjs']]];
const report=[];for(const [name,args] of commands){const run=spawnSync(process.execPath,args,{encoding:'utf8',env:process.env});const log=(run.stdout??'')+(run.stderr??'');writeFileSync(`${out}/${name}.log`,log);const row={name,status:run.status,pass:log.match(/(?:ℹ |# )pass (\d+)/)?.[1]??null,fail:log.match(/(?:ℹ |# )fail (\d+)/)?.[1]??null};report.push(row);console.log(JSON.stringify(row));}
writeFileSync(`${out}/regression-report.json`,JSON.stringify(report,null,2));process.exitCode=report.every(r=>r.status===0)?0:1;
