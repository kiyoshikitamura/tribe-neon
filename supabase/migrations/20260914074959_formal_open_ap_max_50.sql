-- 正式OPEN: 自然回復上限のみ50へ。既存残量・回復アイテム+50・overflow上限500を保持。
begin;
insert into public.canonical_action_resource_master(version,resource_type,natural_max,hard_cap,recovery_amount,recovery_interval_seconds,entry_cost)
select '2026-09-14',resource_type,case when resource_type='VITALITY' then 50 else natural_max end,
 hard_cap,recovery_amount,recovery_interval_seconds,entry_cost
from public.canonical_action_resource_master where version='2026-08-22'
on conflict(version,resource_type) do update set natural_max=excluded.natural_max,hard_cap=excluded.hard_cap,
 recovery_amount=excluded.recovery_amount,recovery_interval_seconds=excluded.recovery_interval_seconds,entry_cost=excluded.entry_cost;
-- 初期値のみ。既存users.vitalityをUPDATEしない。
alter table public.users alter column vitality set default 50;
DO $patch$
declare v_sql text;
begin
 v_sql:=replace(pg_get_functiondef('public.sync_and_recover_vitality_and_pvp_points(uuid)'::regprocedure),chr(13),'');
 if (length(v_sql)-length(replace(v_sql,'v_vit<100','')))/length('v_vit<100')<>2
  or strpos(v_sql,'least(100,v_vit+v_vit_steps)')=0 or strpos(v_sql,'v_vit=100')=0 then
  raise exception 'AP recovery definition drift: review before applying MAX50';
 end if;
 v_sql:=replace(replace(replace(v_sql,'v_vit<100','v_vit<50'),'least(100,v_vit+v_vit_steps)','least(50,v_vit+v_vit_steps)'),'v_vit=100','v_vit=50');
 execute v_sql;
 v_sql:=replace(pg_get_functiondef('public.start_patrol(text,text)'::regprocedure),chr(13),'');
 if strpos(v_sql,'case when vitality>=100 then now() else vitality_last_recovered_at end')=0 then
  raise exception 'Quest AP timer definition drift: review before applying MAX50';
 end if;
 -- 50以上から消費する時にtimerを再開。上限滞在中の経過時間を持ち越さない。
 execute replace(v_sql,'case when vitality>=100 then now() else vitality_last_recovered_at end',
 'case when vitality>=50 then now() else vitality_last_recovered_at end');
end
$patch$;
commit;
