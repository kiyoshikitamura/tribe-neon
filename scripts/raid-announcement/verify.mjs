import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {announcement, messageId, publicationSql} from './release.mjs';
const require = createRequire(path.resolve('scratch/announcement-test-runtime/package.json'));
const {PGlite} = require('@electric-sql/pglite');
const db = new PGlite();
const results = [];
const count = async table => (await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
const rejected = async sql => {await assert.rejects(db.exec(sql)); await db.exec('ROLLBACK; RESET ROLE;');};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.board_posts(id uuid primary key,title text not null,content text not null,
    author_name text not null,user_id uuid,author_id uuid,target_type text not null,target_id uuid,is_system boolean not null,created_at timestamptz default now());
    alter table board_posts enable row level security;
    grant select on board_posts to authenticated;
    create policy board_posts_chat_read on board_posts for select using(target_type='GLOBAL');`);
  await db.exec(fs.readFileSync('supabase/migrations/20260909163114_release_news_foundation.sql','utf8'));
  // Use the candidate's actual KPI trigger, without replacing its implementation.
  const source=fs.readFileSync('supabase/migrations/20260906000249_kpi_authority_extensions.sql','utf8');
  const trigger=source.match(/create function public\.on_kpi_v249_guild_chat_message\(\)[\s\S]*?\$\$;/i)?.[0];
  assert.ok(trigger);
  await db.exec(trigger + `create trigger kpi_check after insert on board_posts for each row execute function public.on_kpi_v249_guild_chat_message();`);
  const sql = publicationSql('2026-09-09T15:00:00Z');
  assert.throws(()=>publicationSql('no date'));
  await rejected(publicationSql('2099-01-01T00:00:00Z'));
  assert.equal(await count('news'),0);
  results.push('future publication rejected');
  await db.exec(`create function fail_message() returns trigger language plpgsql as $$begin raise exception 'fixture: send failed'; end$$;
    create trigger fail_message before insert on board_posts for each row execute function fail_message();`);
  await rejected(sql);
  assert.equal(await count('news'),0);
  await db.exec('drop trigger fail_message on board_posts;');
  results.push('message failure rolls back announcement');
  await db.exec(sql);
  const news = (await db.query('select * from news')).rows[0];
  assert.equal(news.title,announcement.title);
  assert.equal(news.content,announcement.content);
  assert.equal(news.is_published,true);
  const sent=(await db.query('select * from board_posts')).rows[0];
  assert.equal(sent.id,messageId);
  const receipt=(await db.query(fs.readFileSync('scripts/raid-announcement/status.sql','utf8'))).rows;
  assert.equal(receipt.length,1); assert.equal(receipt[0].system_message_id,messageId); assert.equal(receipt[0].visible_now,true);
  assert.equal(sent.content,announcement.system_message);
  assert.equal(sent.is_system,true);
  assert.equal(sent.user_id,null); assert.equal(sent.author_id,null);
  assert.equal(sent.target_type,'GLOBAL');
  results.push('verbatim announcement and one System message; real KPI trigger exits without user fact writes');
  await db.exec(sql); await db.exec(publicationSql('2026-09-09T15:01:00Z'));
  assert.equal(await count('news'),1); assert.equal(await count('board_posts'),1);
  assert.equal((await db.query('select start_at from news')).rows[0].start_at.getTime(),news.start_at.getTime());
  results.push('retries preserve one message and original publication time');
  await db.exec(`insert into news(category,title,content,start_at,end_at,is_published) values
    ('INFO','draft','hidden',now(),null,false),
    ('INFO','future','hidden',now()+interval '1 day',null,true),
    ('INFO','expired','hidden',now()-interval '2 days',now()-interval '1 day',true);`);
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role};`);
    assert.equal(await count('news'),1);
    await rejected("insert into news(category,title,content,start_at) values('INFO','invalid','invalid',now());");
    await db.exec(`set role ${role};`);
    await rejected('update news set is_published=false;');
  }
  results.push('anon/authenticated publication-window RLS and write denial');
  await db.exec(`update news set is_published=false where release_key='${announcement.event_key}';`);
  await db.exec(sql);
  await db.exec('set role authenticated;'); assert.equal(await count('news'),0);
  await db.exec('reset role;'); assert.equal(await count('board_posts'),1);
  results.push('operator unpublish survives retry');
  await db.exec(`update news set content='operator changed' where release_key='${announcement.event_key}';`);
  await rejected(sql); assert.equal(await count('board_posts'),1);
  results.push('conflicting content rejected without duplicate');
  console.log(JSON.stringify({status:'PASS',engine:'isolated PGlite PostgreSQL',results,limitations:'No live Auth/Realtime/Production or multi-connection concurrency test'},null,2));
} finally {await db.close();}
