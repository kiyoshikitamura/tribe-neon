-- 00250用fixtureの追加分。実DBの全schemaや権限継承を模倣しない。
create role service_role;
create role lifecycle_public_probe;
grant usage on schema public to service_role,lifecycle_public_probe;
alter table public.raid_bosses add column spawned_at timestamptz;
insert into public.users(id,username)
select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'検証' || n from generate_series(1,30) n;
