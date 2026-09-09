import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const root='docs/development/raid-production-release';
const pat=fs.readFileSync(path.join(os.homedir(),'.supabase/access-token'),'utf8').trim();
const r=await fetch('https://api.supabase.com/v1/projects/ktpolnkyyfkowxdmijww/database/query',{method:'POST',headers:{Authorization:`Bearer ${pat}`,'Content-Type':'application/json'},body:JSON.stringify({query:'begin read only;select jsonb_agg(to_jsonb(v) order by raid_variant_id) variants from canonical_raid_variants v;rollback;'})});if(!r.ok)throw Error('Variant read failed');fs.writeFileSync(root+'/variants-before.json',JSON.stringify(await r.json(),null,2));
let code=fs.readFileSync('scripts/raid-production-rehearsal/verify-production-bundle.mjs','utf8').split(' const files=process.argv.slice(2);')[0];
code=code.replace("const c=JSON.parse(fs.readFileSync(`${dir}/catalog.json`,'utf8'));",`const c=JSON.parse(fs.readFileSync('${root}/catalog-before.json','utf8'))[0].audit;`);
code+=`
 const release='docs/development/raid-production-release';
 const variants=JSON.parse(fs.readFileSync(release+'/variants-before.json'))[0].variants;
 await db.query('insert into canonical_raid_variants select * from jsonb_populate_recordset(null::canonical_raid_variants,$1::jsonb)',[JSON.stringify(variants)]);
 const apply=fs.readFileSync(release+'/bundle/apply-db.sql','utf8');
 const kpiBefore=(await db.query("select proname,md5(pg_get_functiondef(oid)) hash,proacl from pg_proc where proname in ('kpi_daily_engagement_v1','refresh_kpi_overview_saved_results') order by 1")).rows;
 await db.exec(apply.replace(/commit;\\s*$/,'rollback;'));
 assert.equal((await db.query("select to_regclass('public.raid_rooms') value")).rows[0].value,null);
 result.steps.push({name:'Latest Production + KPI: exact DB bundle atomic rollback',status:'PASS'});
 await db.exec(apply);
 const kpiAfter=(await db.query("select proname,md5(pg_get_functiondef(oid)) hash,proacl from pg_proc where proname in ('kpi_daily_engagement_v1','refresh_kpi_overview_saved_results') order by 1")).rows;
 assert.deepEqual(kpiAfter,kpiBefore);
 assert.equal((await db.query('select count(*)::int n from raid_room_combat_profiles')).rows[0].n,28);
 result.steps.push({name:'Exact DB bundle COMMIT: 28 profiles, KPI bodies/ACL preserved',status:'PASS'});
 await db.exec('begin;'+fs.readFileSync(release+'/bundle/08-approved-settings.sql','utf8')+fs.readFileSync(release+'/bundle/09-open-operations.sql','utf8')+'commit;');
 result.settings=(await db.query("select jsonb_build_object('difficulty',(select jsonb_agg(to_jsonb(t) order by difficulty) from raid_room_difficulty_rules t),'clear',(select jsonb_agg(to_jsonb(t) order by difficulty) from raid_room_clear_reward_rules t),'clearItems',(select jsonb_agg(to_jsonb(t) order by difficulty) from raid_room_clear_reward_items t),'rescueItems',(select jsonb_agg(to_jsonb(t) order by difficulty) from raid_room_rescue_reward_items t)) rules")).rows[0].rules;
 const approved=JSON.parse(fs.readFileSync(release+'/approved-settings.json'));
 for(const p of approved.difficulties){const d=result.settings.difficulty.find(x=>x.difficulty===p.id),c=result.settings.clear.find(x=>x.difficulty===p.id);assert.equal(Number(d.rescue_min_battles),p.rescueMinimumBattles);assert.equal(Number(d.rescue_min_contribution_damage),p.rescueDamageInclusive);assert.equal(Number(c.minimum_contribution_damage),p.clearDamageExclusive);assert.equal(c.enabled,true);}
 result.steps.push({name:'Approved public settings and operation flag transaction',status:'PASS'});
 const stop=fs.readFileSync(release+'/bundle/05-stop-new-operations.sql','utf8');
 const stopBody=stop.slice(stop.indexOf('begin;'),stop.indexOf('\\\\if :raid_commit'));
 await db.exec(stopBody+'commit;');
 for(const t of ['raid_room_creation_settings','raid_room_battle_settings','raid_room_rescue_settings','raid_legacy_settings'])assert.equal((await db.query('select enabled from '+t)).rows[0].enabled,false);
 result.steps.push({name:'Prepared intake stop preserves data/schema',status:'PASS'});
 result.status='PASS';result.database=db.database;result.scope='Only current KPI drift, exact bundle, approved settings, atomic rollback and stop. Existing lifecycle/Edge/UI evidence reused.';
 fs.writeFileSync(release+'/rehearsal.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,database:db.database,steps:result.steps}));
}finally{await db.close();}
`;
fs.writeFileSync('scripts/raid-production-release/rehearse.mjs',code);
