// Isolated scratch PostgreSQL only. Never uses project credentials/linked DB.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const port = process.argv[2];
assert.equal(port, '55449', 'Dedicated local scratch port required');
const migration = readFileSync('supabase/migrations/20260906000249_kpi_authority_extensions.sql','utf8');
assert.doesNotMatch(migration, /create or replace|drop\s+(table|function|view)|delete\s+from/i);
assert.doesNotMatch(migration, /update\s+public\.(kpi_subjects|kpi_daily_user_activity|kpi_account_classification_periods|kpi_guild_membership_periods|kpi_tutorial_completion_facts|kpi_gacha_execution_facts|kpi_aggregation_runs|kpi_metric_snapshots|feature_operating_states)\b/i);
const fixture = `
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
create table public.kpi_subjects(subject_id uuid primary key,source_user_id uuid unique,registered_at timestamptz not null,detached_at timestamptz);
create table public.kpi_guild_membership_periods(id bigint generated always as identity primary key,subject_id uuid,guild_id uuid,joined_at timestamptz,left_at timestamptz,source_membership_id uuid);
create table public.kpi_daily_user_activity(activity_date date,subject_id uuid,first_active_at timestamptz,last_active_at timestamptz,primary key(activity_date,subject_id));
create function public.kpi_jst_day_start(date) returns timestamptz language sql as $$ select ($1::timestamp at time zone 'Asia/Tokyo') $$;
create function public.kpi_is_subject_excluded(uuid,timestamptz) returns boolean language sql as $$ select false $$;
create table public.users(id uuid primary key,username text not null,favorite_character_id text,guild_id uuid);
create table public.user_characters(id uuid primary key default gen_random_uuid(),user_id uuid,character_id text);
create table public.tutorial_progress(user_id uuid primary key,step_id text,completed_at timestamptz);
create table public.kpi_tutorial_completion_facts(subject_id uuid primary key,completed_at timestamptz);
create table public.guilds(id uuid primary key,name text,leader_id uuid,is_disbanded boolean default false,created_at timestamptz default now());
create table public.guild_members(id uuid primary key default gen_random_uuid(),guild_id uuid,user_id uuid unique,role text,joined_at timestamptz default now());
create function public.fixture_kpi_membership() returns trigger language plpgsql as $$ declare s uuid; begin select subject_id into s from public.kpi_subjects where source_user_id=new.user_id; insert into public.kpi_guild_membership_periods(subject_id,guild_id,joined_at,source_membership_id) values(s,new.guild_id,new.joined_at,new.id); return new; end $$;
create trigger kpi_guild_member_joined_trigger after insert on public.guild_members for each row execute function public.fixture_kpi_membership();
create table public.board_posts(id uuid primary key default gen_random_uuid(),content text,title text,author_name text,user_id uuid,target_type text,target_id uuid,is_system boolean default false,created_at timestamptz default now());
-- Simulate permissive Supabase defaults to verify explicit revocations.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
`;
const tests = readFileSync('supabase/tests/20260906000249_kpi_authority_extensions_partial.sql','utf8');
const sql = fixture + migration + tests.replace(/^begin;$/m,'-- outer transaction already open');
const result = spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',[
  '-X','-w','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','kpi249_local','-d','postgres'
],{input:sql,encoding:'utf8'});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if(result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
