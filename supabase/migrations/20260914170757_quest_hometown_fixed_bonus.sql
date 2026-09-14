-- 2026-09-14承認: 新規QuestだけCASH+10% / Drop+200bp。既存Snapshotは保持。
create or replace function public.quest_hometown_snapshot(p_user uuid, p_character text, p_course text)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare v record; v_match boolean;
begin
 select c.character_id,c.level,c.awakening_level,m.hometown,q.town_id,q.cash_reward into v
 from public.user_characters c
 join public.canonical_character_master m on m.version='2026-08-21' and m.character_id=c.character_id
 join public.canonical_quest_master q on q.version='2026-08-30' and q.quest_id=p_course
 where c.user_id=p_user and (c.character_id=p_character or c.id::text=p_character)
 order by (c.id::text=p_character) desc,c.id limit 1;
 if not found then raise exception 'hometown snapshot source missing' using errcode='23503'; end if;
 v_match:=coalesce(public.quest_town_key(v.hometown)=public.quest_town_key(v.town_id),false);
 return jsonb_build_object('version',2,'character_id',v.character_id,'level',v.level,'awakening',v.awakening_level,
 'town',public.quest_town_key(v.town_id),'matched',v_match,
 'cash_bonus_rate',case when v_match then 0.10 else 0 end,
 'cash',case when v_match then floor(v.cash_reward::numeric * 0.10)::bigint else 0 end,
 'drop_bonus_bp',case when v_match then 200 else 0 end);
end $function$;
-- claim_patrol_rewards、INSERT trigger、権限、基礎Master、既存進行中行は変更しない。
