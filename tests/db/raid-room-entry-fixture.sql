-- 00255境界用double。実キャラクター成長・装備・Snapshot生成公式は対象外。
create table entry_fixture_snapshots(user_id uuid primary key,payload jsonb);
insert into entry_fixture_snapshots select id,'[{"id":"fixture-player","stats":{"hp":280000,"atk":10000,"def":10000}}]'::jsonb from users;
create or replace function build_server_battle_snapshot(p_uid uuid,p_ids text[],p_team text) returns jsonb language plpgsql as $$
begin
 if p_ids is distinct from array['fixture-player']::text[] then raise exception 'invalid fixture owned formation' using errcode='22023'; end if;
 return (select payload from public.entry_fixture_snapshots where user_id=p_uid);
end $$;

-- 呼出元のsearch_pathがpg_catalogでも依存doubleは解決できるよう固定。
alter function public.calculate_user_total_power(uuid) set search_path=public;
alter function public.sync_and_recover_vitality_and_pvp_points(uuid) set search_path=public;
-- 現行5敵構築契約の最小データ。バランス/7種マスターの検証ではない。
update canonical_raid_variants set member_character_ids='["enemy","enemy2","enemy3","enemy4","enemy5"]';
insert into canonical_quest_enemy_pool_entries select '2026-08-30','enemy'||n,'HARD',true,1,'[]'::jsonb from generate_series(2,5)n;
