import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('scratch/announcement-test-runtime/package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table users(id uuid primary key);
 create table social_activity_feed(id uuid primary key,activity_type text,actor_user_id uuid references users(id) on delete set null,
 actor_display_name text,guild_id uuid,object_master_id text,display_payload jsonb,permanent boolean,created_at timestamptz);
 create table kpi_subjects(subject_id uuid primary key,source_user_id uuid);
 create table kpi_account_classification_periods(subject_id uuid,classification text,valid_from timestamptz,valid_to timestamptz);`);
 await db.exec(fs.readFileSync('supabase/migrations/20260904000240_recent_social_activity_authority.sql','utf8'));
 const acl=(await db.query("select proacl::text from pg_proc where proname='get_recent_social_activity_feed'")).rows[0].proacl;
 await db.exec(fs.readFileSync('supabase/migrations/20260909181921_activity_actor_visibility.sql','utf8'));
 assert.equal((await db.query("select proacl::text from pg_proc where proname='get_recent_social_activity_feed'")).rows[0].proacl,acl);
 await db.exec(`insert into users select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,6)i;
 insert into social_activity_feed select id,'SSR_CHARACTER',id,case when id::text like '%1' then 'QAという名前の実ユーザー' else 'fixture' end,null,'char', '{}',false,now()-interval '1 hour' from users;
 insert into kpi_subjects select id,id from users;
 insert into kpi_account_classification_periods select id,case when id::text like '%2' then 'qa' when id::text like '%3' then 'test' else 'normal' end,now()-interval '2 hours',null from users;
 delete from users where id::text like '%4';
 update social_activity_feed set created_at=now()-interval '25 hours' where id::text like '%5';
 update social_activity_feed set created_at=now()+interval '1 hour' where id::text like '%6';`);
 await assert.rejects(db.query('select * from get_recent_social_activity_feed()'),/authentication required/);
 await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';set role authenticated;");
 const visible=await db.query('select * from get_recent_social_activity_feed(1)');
 assert.equal(visible.rows.length,1);assert.equal(visible.rows[0].actor_display_name,'QAという名前の実ユーザー');
 await db.exec('reset role;');
 assert.equal((await db.query('select count(*)::int n from social_activity_feed')).rows[0].n,6);
 // Half-open classification boundary: a QA period ending at the event does not hide it.
 await db.exec("update kpi_account_classification_periods set valid_to=(select created_at from social_activity_feed where id::text like '%2') where classification='qa';");
 assert.equal((await db.query('select * from get_recent_social_activity_feed(50)')).rows.length,2);
 console.log('PASS: deleted actor/QA/test exclusion before LIMIT; real QA-name retained; history/ACL/auth/time window/classification boundary preserved');
} finally {await db.close();}
