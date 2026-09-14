-- Quest発見Raid: Item2倍を廃止し、撃破受給時に基礎Quest CASH + User EXP50%を別途付与。
alter table public.quest_raid_encounters add column bonus_cash bigint check(bonus_cash>=0), add column bonus_user_xp integer check(bonus_user_xp>=0);
alter table public.quest_raid_encounter_bonus_grants add column cash bigint, add column user_xp integer;
create function public._quest_raid_cash_xp_v2(p_patrol uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('cash',coalesce((p.rewards_accrued->>'base_cash')::bigint,q.cash_reward::bigint),
 'userXp',floor(coalesce((p.rewards_accrued->>'xp')::numeric,q.user_exp::numeric)*0.5)::integer)
 from public.user_patrols p join public.canonical_quest_master q
 on q.version='2026-08-30' and q.quest_id=coalesce(p.course_id,p.quest_id) where p.id=p_patrol
$$;
revoke all on function public._quest_raid_cash_xp_v2(uuid) from public,anon,authenticated,service_role;
-- 新規抽選で記録。既存Questのhometown Snapshotや既存Encounter行は更新しない。
do $$ declare d text; anchor text:='bonus_items=bonus,reward_multiplier=2'; begin
 d:=pg_get_functiondef('public.resolve_quest_raid_encounter_v1(uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'resolve encounter anchor missing';end if;
 execute replace(d,anchor,'bonus_items=''[]''::jsonb,reward_multiplier=1,bonus_cash=(public._quest_raid_cash_xp_v2(p_patrol_id)->>''cash'')::bigint,bonus_user_xp=(public._quest_raid_cash_xp_v2(p_patrol_id)->>''userXp'')::integer');
end $$;
create or replace function public.issue_quest_raid_encounter_bonus_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.quest_raid_encounters%rowtype; amounts jsonb; v_cash bigint; v_xp integer; inserted integer;
begin
 -- 救援成功だけでは付与しない。正式撃破受給ledgerを単一入口にする。
 if tg_table_name<>'raid_room_clear_rewards' then return new;end if;
 select * into e from public.quest_raid_encounters where room_id=new.room_id and status='CREATED';
 if not found then return new;end if;
 amounts:=public._quest_raid_cash_xp_v2(e.patrol_id);
 v_cash:=coalesce(e.bonus_cash,(amounts->>'cash')::bigint);
 v_xp:=coalesce(e.bonus_user_xp,(amounts->>'userXp')::integer);
 if v_cash is null or v_xp is null then raise exception 'quest bonus authority missing';end if;
 insert into public.quest_raid_encounter_bonus_grants(room_id,user_id,rule_version,cash,user_xp)
 values(new.room_id,new.user_id,3,v_cash,v_xp) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return new;end if;
 if v_cash>0 then update public.users set cash=cash+v_cash where id=new.user_id;end if;
 if v_xp>0 then perform public.apply_user_xp(new.user_id,v_xp);end if;
 return new;
end $$;
create or replace function public.get_quest_raid_bonus_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare e public.quest_raid_encounters%rowtype; amounts jsonb; receipt public.quest_raid_encounter_bonus_grants%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 perform public.get_raid_room_v1(p_room_id);
 select * into e from public.quest_raid_encounters where room_id=p_room_id and status='CREATED';
 if not found then return null;end if;
 amounts:=public._quest_raid_cash_xp_v2(e.patrol_id);
 select * into receipt from public.quest_raid_encounter_bonus_grants where room_id=p_room_id and user_id=auth.uid();
 return jsonb_build_object('roomId',p_room_id,'rewardMultiplier',1,'items','[]'::jsonb,'delivery','DIRECT',
 'cash',coalesce(receipt.cash,e.bonus_cash,(amounts->>'cash')::bigint),
 'userXp',coalesce(receipt.user_xp,e.bonus_user_xp,(amounts->>'userXp')::integer),
 'issued',receipt.room_id is not null,'legacyIssued',receipt.room_id is not null and receipt.cash is null);
end $$;
-- 発見/再訪画面にもサーバー確定値を投影。Item2倍は旧行でも提示しない。
do $$ declare d text; anchor text:='''rewardMultiplier'',e.reward_multiplier'; begin
 d:=pg_get_functiondef('public.quest_raid_encounter_projection_v1(uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'projection anchor missing';end if;
 d:=replace(d,anchor,'''rewardMultiplier'',1,''bonusCash'',coalesce(e.bonus_cash,(public._quest_raid_cash_xp_v2(e.patrol_id)->>''cash'')::bigint),''bonusUserXp'',coalesce(e.bonus_user_xp,(public._quest_raid_cash_xp_v2(e.patrol_id)->>''userXp'')::integer)');
 d:=replace(d,'''bonusItems'',coalesce(e.bonus_items,''[]''::jsonb)','''bonusItems'',''[]''::jsonb');
 execute d;
end $$;
