-- PostgreSQL依存schemaの最小fixture。既存migration全件やAuthサービスの代替ではない。
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;
grant usage on schema public,auth to anon,authenticated;
create table public.users(id uuid primary key,username text not null);
create table public.raid_bosses(id uuid primary key,current_hp bigint,max_hp bigint,status text,expires_at timestamptz,outcome_finalized_at timestamptz);
create table public.raid_instance_user_progress(raid_boss_instance_id uuid,user_id uuid,finalized_battles int,primary key(raid_boss_instance_id,user_id));
create table public.guilds(id uuid primary key,name text not null);
create table public.guild_members(user_id uuid primary key,guild_id uuid);
create table public.raid_damage_logs(id uuid primary key,raid_boss_instance_id uuid,user_id uuid,guild_id uuid,raw_damage bigint not null,applied_damage bigint not null,created_at timestamptz);
