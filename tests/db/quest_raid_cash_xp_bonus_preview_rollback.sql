begin;
set local statement_timeout='30s';
do $$
declare e record; a jsonb; before_cash bigint; old_items jsonb; new_items jsonb; r record; old_snapshots text;
begin
 select * into e from public.quest_raid_encounters where status='CREATED' limit 1;
 if not found then raise exception 'encounter fixture missing';end if;
 select md5(string_agg(id::text||hometown_bonus_snapshot::text,'' order by id)) into old_snapshots from public.user_patrols;
 -- 明示した基礎receiptをfixtureに使用。地元を含むcash9999を入力しても基礎300だけ。
 update public.user_patrols set rewards_accrued=jsonb_build_object('base_cash',300,'cash',9999,'xp',100) where id=e.patrol_id;
 update public.quest_raid_encounters set bonus_cash=null,bonus_user_xp=null where patrol_id=e.patrol_id;
 a:=public._quest_raid_cash_xp_v2(e.patrol_id);
 if a<>jsonb_build_object('cash',300,'userXp',50) then raise exception 'bonus uses hometown or wrong XP';end if;
 delete from public.raid_room_clear_reward_grants where room_id=e.room_id and user_id=e.user_id;
 delete from public.raid_room_clear_rewards where room_id=e.room_id and user_id=e.user_id;
 delete from public.quest_raid_encounter_bonus_grants where room_id=e.room_id and user_id=e.user_id;
 select cash into before_cash from public.users where id=e.user_id;
 select jsonb_object_agg(item_id,quantity) into old_items from public.user_items where user_id=e.user_id;
 insert into public.raid_room_clear_rewards(room_id,user_id,rule_version,finalized_battles,contribution_damage,clear_gate,issued_at,expires_at)
 values(e.room_id,e.user_id,2,1,1,'{"status":"succeeded"}',now(),now()+interval '30days');
 select * into r from public.quest_raid_encounter_bonus_grants where room_id=e.room_id and user_id=e.user_id;
 if r.cash<>300 or r.user_xp<>50 or (select cash from public.users where id=e.user_id)<>before_cash+300 then raise exception 'cash XP receipt mismatch';end if;
 -- 再送相当:受給呼出を再現してもbonusledgerで二重付与なし。
 delete from public.raid_room_clear_rewards where room_id=e.room_id and user_id=e.user_id;
 insert into public.raid_room_clear_rewards(room_id,user_id,rule_version,finalized_battles,contribution_damage,clear_gate,issued_at,expires_at)
 values(e.room_id,e.user_id,2,1,1,'{"status":"succeeded"}',now(),now()+interval '30days');
 select jsonb_object_agg(item_id,quantity) into new_items from public.user_items where user_id=e.user_id;
 if (select cash from public.users where id=e.user_id)<>before_cash+300 or old_items is distinct from new_items then raise exception 'duplicate or item bonus';end if;
 if (select md5(string_agg(id::text||hometown_bonus_snapshot::text,'' order by id)) from public.user_patrols) is distinct from old_snapshots then raise exception 'hometown snapshot changed';end if;
 if (public.quest_raid_encounter_projection_v1(e.patrol_id)->>'rewardMultiplier')::int<>1 then raise exception '2x projection remains';end if;
end $$;
select 'PASS: base CASH only, XP50% receipt, item unchanged, retry once, hometown snapshot untouched, multiplier1' result;
rollback;
