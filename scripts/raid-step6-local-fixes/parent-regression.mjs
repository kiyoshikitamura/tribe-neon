import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const out = 'outputs/raid-step6-local-fixes';
fs.mkdirSync(out, {recursive: true});
const runtime = path.resolve('../../2026-09-08/2-375a0ad-21-raid-migration-14/outputs/raid-test-runtime');
const env = {...process.env, RAID_TEST_RUNTIME_DIR: runtime, C_EQUIPMENT_MIGRATION: 'supabase/migrations/20260909075933_initial_equipment_authority.sql'};
const groups = [
  ['raid-errors', ['--experimental-strip-types', '--test', ...['requirement-presentation','client','rpc-transport','power-gate'].map(n => `tests/raid-room/${n}.test.mjs`)]],
  ['raid-browser', ['tests/raid-room/run-browser-tests.mjs']],
  ['raid-replay', ['tests/raid-room/run-use-battle-room-tests.mjs']],
  ['equipment-projection', ['scripts/verify_initial_equipment_state.mjs']],
  ['equipment-sql', ['scripts/raid-step6-local-fixes/c-authority-test.mjs']],
  ['equipment-vertical', ['scripts/raid-step6-local-fixes/c-equipment-vertical.mjs']],
];
const results = [];
for (const [name,args] of groups) {
  const run = spawnSync(process.execPath, args, {env, encoding:'utf8', maxBuffer:8*1024*1024});
  const output = (run.stdout ?? '') + (run.stderr ?? '');
  fs.writeFileSync(`${out}/${name}.txt`, output);
  const result = {name,args,exitCode:run.status,pass:Number(output.match(/(?:#|ℹ) pass (\d+)/)?.[1] ?? 0),fail:Number(output.match(/(?:#|ℹ) fail (\d+)/)?.[1] ?? 0)};
  results.push(result); console.log(JSON.stringify(result));
  if (run.status !== 0) process.exitCode = 1;
}
fs.writeFileSync(`${out}/regression.json`, JSON.stringify({localOnly:true,results},null,2));
