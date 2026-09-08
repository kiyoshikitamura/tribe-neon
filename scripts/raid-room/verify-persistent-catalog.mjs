import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='docs/development/evidence/raid-room-persistent-20260908';
const a=JSON.parse(fs.readFileSync('docs/development/evidence/raid-room-step2-20260908/catalog.json'));
const b=JSON.parse(fs.readFileSync(`${dir}/catalog-after.json`));
const plan=JSON.parse(fs.readFileSync('docs/development/evidence/raid-room-step2-20260908/plan-manifest.json'));
const allowed=new Set([...plan.existing_function_names_replaced,'build_server_battle_snapshot']);
const key=f=>`${f.name}(${f.args})`;
const newRelations=b.relations.filter(r=>!a.relations.some(x=>x.name===r.name));
assert.equal(newRelations.length,22);
assert(newRelations.every(r=>r.name.startsWith('raid_')&&r.rls));
const protectedFunctions=a.functions.filter(f=>!allowed.has(f.name));
for(const f of protectedFunctions){
 const next=b.functions.find(g=>key(g)===key(f));assert(next,key(f));
 for(const prop of ['md5','owner','acl','config','result','security_definer'])assert.deepEqual(next[prop],f[prop],`${key(f)} ${prop}`);
}
for(const column of a.columns)assert.deepEqual(b.columns.find(c=>c.table===column.table&&c.column===column.column),column);
for(const trigger of a.triggers)assert.deepEqual(b.triggers.find(t=>t.table===trigger.table&&t.name===trigger.name),trigger);
assert.deepEqual(b.cron,a.cron);assert.deepEqual(b.migrations,a.migrations);
const before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),after=JSON.parse(fs.readFileSync(`${dir}/after.json`));
assert.deepEqual(after.rows,before.rows);
const result={status:'PASS',new_public_relations:newRelations.map(x=>x.name),counts:{public_relations:[a.relations.length,b.relations.length],public_functions:[a.functions.length,b.functions.length],columns:[a.columns.length,b.columns.length],triggers:[a.triggers.length,b.triggers.length]},protected_functions_body_owner_acl_config_result_unchanged:protectedFunctions.length,existing_columns_unchanged:a.columns.length,existing_triggers_unchanged:a.triggers.length,existing_data_tables_unchanged:13,cron_unchanged:b.cron.length,migration_history_unchanged:b.migrations.length};
fs.writeFileSync(`${dir}/catalog-comparison.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
