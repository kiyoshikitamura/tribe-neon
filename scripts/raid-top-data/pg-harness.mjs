/** 新規の隔離DBだけを作成。既存OSのDB/外部URLを受け取らない。 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const root=fileURLToPath(new URL('../../',import.meta.url));
const runtime=process.env.RAID_TOP_DATA_RUNTIME || resolve(root,'outputs/raid-top-data-runtime');
export const {Client}=createRequire(resolve(runtime,'package.json'))('pg');
export const connection={host:'127.0.0.1',port:55462,user:'raid_top_local',database:'postgres'};
export async function bootstrap(){
 const admin=new Client(connection);await admin.connect();const marker=await admin.query("select current_user,inet_server_addr()::text host,inet_server_port() port,version()");
 if(marker.rows[0].current_user!=='raid_top_local'||marker.rows[0].host!=='127.0.0.1/32'||marker.rows[0].port!==55462||!marker.rows[0].version.includes('PostgreSQL 17'))throw Error('Isolated PostgreSQL identity mismatch');
 const database=`raid_top_test_${Date.now()}_${process.pid}`;
 await admin.query(`create database ${database}`);await admin.end();const config={...connection,database,options:'-c statement_timeout=15000'};const db=new Client(config);await db.connect();
 for(const role of ['anon','authenticated','service_role','lifecycle_public_probe'])await db.query(`do $$begin if not exists(select from pg_roles where rolname='${role}') then create role ${role};end if;end$$`);
 const fixtures=['read-projection','lifecycle','creation','legacy-isolation','entry','finalization','recovery','rescue','rescue-rewards'];
 for(const name of fixtures){let sql=readFileSync(resolve(root,`tests/db/raid-room-${name}-fixture.sql`),'utf8');sql=sql.replace(/create role (anon|authenticated|service_role|lifecycle_public_probe);/gi,'');await db.query(sql);}
 const dir=resolve(root,'supabase/migrations');const validation=readFileSync(resolve(dir,'20260813000144_official_battle_replay_contract.sql'),'utf8').match(/create or replace function public\.validate_official_battle_result[\s\S]*?\$\$;/)[0];await db.query(validation);
 for(const name of readdirSync(dir).filter(f=>/^202609080002(5[0-9]|60)_/.test(f)).sort())await db.query(readFileSync(resolve(dir,name),'utf8'));
 await db.query(readFileSync(resolve(root,'supabase/tests/raid-top-data-fixture.sql'),'utf8'));
 const master=JSON.parse(readFileSync(resolve(root,'src/domain/gameplay/canonical/data/raid_production_20260830.json'),'utf8'));
 for(const v of master.variants){await db.query('insert into raid_boss_master(id) values($1) on conflict do nothing',[v.raidVariantId]);await db.query('insert into canonical_raid_variants values($1,$2,$3,$4,true)',[v.raidVariantId,v.areaId,v.raidName,v.maxHp]);}
 for(const name of ['20260908175140_raid_top_daily_authority.sql','20260908175143_raid_top_aggregate_api.sql']){const sql=readFileSync(resolve(dir,name),'utf8');if(!sql.trim())throw Error(`Migration not ready: ${name}`);await db.query(sql);}
 return {db,config,database};
}
export const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
export async function user(db,n=1){await db.query('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n===null?'':uid(n)]);await db.query('set role authenticated');}
export async function value(db,sql,args=[]){return (await db.query(sql,args)).rows[0]?.value;}
