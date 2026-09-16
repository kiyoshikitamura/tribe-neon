do $$ begin
 if (select count(*) from public.canonical_quest_master where version='2026-08-30' and jsonb_array_length(progression_boss_members)=5)<>21 then raise exception 'Expected 21 fixed bosses'; end if;
 if exists(select 1 from public.canonical_quest_master q cross join lateral jsonb_array_elements(q.progression_boss_members) m where q.version='2026-08-30' and (not exists(select 1 from public.canonical_character_master c where c.version='2026-08-21' and c.character_id=m->>'characterId') or not exists(select 1 from public.canonical_skill_master s where s.version='2026-08-21' and s.skill_id=m#>>'{equippedSkillRefs,0}'))) then raise exception 'Unknown boss character/skill ID'; end if;
end $$;

create or replace function public.quest_progression_enemy_snapshot_v1(p_snapshot jsonb,p_quest_id text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare q public.canonical_quest_master%rowtype; members jsonb;
begin
 select * into q from public.canonical_quest_master where version='2026-08-30' and quest_id=p_quest_id;
 if q.progression_boss_members is null then return p_snapshot; end if;
 select jsonb_agg(m||jsonb_build_object('skills',jsonb_build_array(jsonb_build_object(
  'id',s.skill_id,'name',s.display_name,'activationType',s.activation_type,'cooldown',s.cooldown,
  'availableFromRound',s.available_from_round,'target',s.target,'effects',s.effects,
  'exclusiveCharacterId',s.exclusive_character_id,'skillPlusVal',0))) order by ord) into members
 from jsonb_array_elements(q.progression_boss_members) with ordinality e(m,ord)
 join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=m#>>'{equippedSkillRefs,0}';
 if jsonb_array_length(members)<>5 then raise exception 'Fixed boss must contain five valid skills'; end if;
 return jsonb_build_object('members',members,'partySignature',(select string_agg(m->>'characterId','|' order by ord) from jsonb_array_elements(members) with ordinality e(m,ord)),
  'enemyTactic','BALANCED','designTactic',q.progression_boss_design_tactic,'progressionBalanceVersion','2026-09-17','recommendedPower',q.progression_recommended_power);
end $$;
revoke all on function public.quest_progression_enemy_snapshot_v1(jsonb,text) from public,anon,authenticated;

create or replace function public.on_canonical_patrol_snapshot() returns trigger
language plpgsql security definer set search_path=public as $$
declare snapshot jsonb;
begin
 if new.progression_kind='FIRST_CLEAR' then
  snapshot:=public.quest_progression_enemy_snapshot_v1(null,coalesce(new.course_id,new.quest_id));
 end if;
 if snapshot is null then snapshot:=public.generate_canonical_quest_encounter_snapshot(new.user_id,coalesce(new.course_id,new.quest_id));end if;
 new.encounter_snapshot:=snapshot;new.encounter_party_signature:=snapshot->>'partySignature';return new;
end $$;

-- 進行中探索・作成済みreplayのsnapshotは保持。変更は新しい探索から適用する。

create or replace function public.get_canonical_quest_progression() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 if not public.quest_progression_enabled_v1(auth.uid()) then return public.get_canonical_quest_progression_pre_progression_v1();end if;
 select coalesce(jsonb_agg(jsonb_build_object('quest_id',m.quest_id,'progression_enabled',true,
 'stage_order',m.display_order,'unlock_condition',m.unlock_condition,
 'is_unlocked',public.canonical_quest_is_unlocked(auth.uid(),m.quest_id),
 'is_first_cleared',exists(select 1 from public.user_quest_first_clears c where c.user_id=auth.uid() and c.quest_id=m.quest_id),
 'boss_patrol_id',p.id,'boss_ready',coalesce(p.expires_at<=now() and p.battle_result is distinct from 'VICTORY',false),
 'last_battle_result',p.battle_result,'enemy_tactic','BALANCED',
 'enemy_member_count',jsonb_array_length(coalesce(p.encounter_snapshot->'members',m.progression_boss_members,'[]'::jsonb)),
 'enemy_members',coalesce(p.encounter_snapshot->'members',m.progression_boss_members,'[]'::jsonb),
 'recommended_power',m.progression_recommended_power,
 'enemy_attributes',coalesce((select jsonb_agg(distinct member->>'alignment') from jsonb_array_elements(coalesce(p.encounter_snapshot->'members',m.progression_boss_members,'[]'::jsonb)) member),'[]'::jsonb)) order by m.display_order),'[]'::jsonb) into result
 from public.canonical_quest_master m left join lateral(select x.* from public.user_patrols x where x.user_id=auth.uid()
 and coalesce(x.course_id,x.quest_id)=m.quest_id and x.progression_kind='FIRST_CLEAR' and x.status in('ONGOING','CLAIMABLE') order by x.started_at desc limit 1)p on true
 where m.version='2026-08-30' and m.is_production_enabled;
 return result;
end $$;
