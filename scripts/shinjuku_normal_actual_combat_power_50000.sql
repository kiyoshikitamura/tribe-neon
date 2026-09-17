-- Reduce actual Shinjuku NORMAL enemy strength from 60000 to 50000.
do $fix$
declare boss jsonb; total integer; corrected jsonb;
begin
select progression_boss_members into boss from public.canonical_quest_master where version='2026-08-30' and quest_id='q_shinjuku_2' for update;
select sum((m#>>'{stats,hp}')::int+(m#>>'{stats,atk}')::int+(m#>>'{stats,def}')::int) into total from jsonb_array_elements(boss) m;
if total not in(60000,50000) then raise exception 'Unexpected Shinjuku NORMAL power: %',total;end if;
if total=60000 then
select jsonb_agg(m||jsonb_build_object('stats',(m->'stats')||jsonb_build_object('hp',round((m#>>'{stats,hp}')::numeric*5/6)::int,'atk',round((m#>>'{stats,atk}')::numeric*5/6)::int,'def',round((m#>>'{stats,def}')::numeric*5/6)::int)) order by n) into corrected from jsonb_array_elements(boss) with ordinality e(m,n);
select sum((m#>>'{stats,hp}')::int+(m#>>'{stats,atk}')::int+(m#>>'{stats,def}')::int) into total from jsonb_array_elements(corrected) m;
corrected:=jsonb_set(corrected,'{0,stats,hp}',to_jsonb((corrected#>>'{0,stats,hp}')::int+50000-total));
update public.canonical_quest_master set progression_boss_members=corrected,progression_recommended_power=50000 where version='2026-08-30' and quest_id='q_shinjuku_2';
end if;
end $fix$;
update public.user_patrols set encounter_snapshot=public.quest_progression_enemy_snapshot_v1(encounter_snapshot,'q_shinjuku_2') where progression_kind='FIRST_CLEAR' and coalesce(course_id,quest_id)='q_shinjuku_2' and status in('ONGOING','CLAIMABLE') and battle_result is distinct from 'VICTORY';
