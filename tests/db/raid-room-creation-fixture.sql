-- 生成API用の最小依存。Auth/JWTサービス、既存全schema・triggerは再現しない。
alter table public.users add column level integer default 5;
alter table public.users add column cash bigint default 12345;
alter table public.users add column diamond bigint default 678;
alter table public.users add column raid_points integer default 9;
create table public.user_main_formations(user_id uuid,user_character_id uuid);
create table public.creation_fixture_power(user_id uuid primary key,power bigint);
-- 総合力公式の検証ではない。DBからの値のみで判定することを検証するdouble。
create function public.calculate_user_total_power(p_user_id uuid) returns bigint language sql stable as $$
 select power from public.creation_fixture_power where user_id=p_user_id
$$;
create table public.raid_boss_master(id text primary key);
insert into public.raid_boss_master values('BOSS_A'),('BOSS_B');
create table public.canonical_raid_variants(raid_variant_id text primary key,area_id text,raid_name text,max_hp bigint,is_production_enabled boolean);
insert into public.canonical_raid_variants values('BOSS_A','shinjuku','検証ボスA',28000000,true),('BOSS_B','shibuya','検証ボスB',38000000,true),('DISABLED','shinjuku','非公開',1000,false);
alter table public.raid_bosses alter column id set default gen_random_uuid();
alter table public.raid_bosses add column boss_id text not null;
alter table public.raid_bosses add column boss_master_id text references public.raid_boss_master(id);
alter table public.raid_bosses add column base_id text;
alter table public.raid_bosses add column cycle_id uuid not null default gen_random_uuid();
alter table public.raid_bosses add column rotation_date date;
alter table public.raid_bosses add column raid_variant_id text references public.canonical_raid_variants(raid_variant_id);
alter table public.raid_bosses add column raid_day_key text;
insert into public.user_main_formations select id,gen_random_uuid() from public.users;
insert into public.creation_fixture_power select id,300000 from public.users;
-- initial_schema/00146/00210にある新INSERT対象のNOT NULLと外部キーを保持。
alter table public.raid_bosses alter column expires_at set not null;
alter table public.raid_bosses alter column spawned_at set not null;
