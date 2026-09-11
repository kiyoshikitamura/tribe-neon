-- Fix the Tutorial-only combat values so the authored teaching sequence is
-- deterministic: opening strike, Enemy damage, positive Heal, Round 2 finisher.
create or replace function public.apply_tutorial_player_snapshot(p_user_id uuid,p_snapshot jsonb)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when exists(select 1 from public.tutorial_progress where user_id=p_user_id and step_id='TUTORIAL_BATTLE') then
    coalesce((select jsonb_agg(
      jsonb_set(
        jsonb_set(unit,'{stats,spd}',to_jsonb(case
          when exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_022') then 250
          when exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_001') then 200
          else 50 end),true),
        '{stats,atk}',to_jsonb(case
          when exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_022') then 2000
          when exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_001') then 1000
          else 200 end),true)
      || case when exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id'='SKILL_022')
        then jsonb_build_object('turnAvailableFromRound',2) else '{}'::jsonb end
      order by unit_ordinality)
    from jsonb_array_elements(coalesce(p_snapshot,'[]'::jsonb)) with ordinality units(unit,unit_ordinality)
    where exists(select 1 from jsonb_array_elements(coalesce(unit->'skills','[]'::jsonb)) skill where skill->>'id' in ('SKILL_001','SKILL_003','SKILL_022'))),'[]'::jsonb)
  else p_snapshot end;
$$;

create or replace function public.apply_tutorial_enemy_snapshot(p_user_id uuid,p_player_snapshot jsonb,p_enemy_snapshot jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_player_hp integer; v_player_def integer;
begin
  if not exists(select 1 from public.tutorial_progress where user_id=p_user_id and step_id='TUTORIAL_BATTLE') then return p_enemy_snapshot; end if;
  select max((unit#>>'{stats,hp}')::integer),max((unit#>>'{stats,def}')::integer)
  into v_player_hp,v_player_def from jsonb_array_elements(coalesce(p_player_snapshot,'[]'::jsonb)) unit;
  return coalesce((select jsonb_agg(
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(unit,'{stats,hp}','1800'::jsonb,true),
      '{stats,def}','0'::jsonb,true),'{stats,spd}',to_jsonb(case when unit_ordinality=1 then 150 else 25 end),true),
      '{stats,atk}',to_jsonb(case when unit_ordinality=1 then greatest(1,round(coalesce(v_player_hp,1)*0.45+coalesce(v_player_def,0))::integer) else 0 end),true),
      '{skills}','[]'::jsonb,true)
    order by unit_ordinality)
  from jsonb_array_elements(coalesce(p_enemy_snapshot,'[]'::jsonb)) with ordinality enemies(unit,unit_ordinality)),'[]'::jsonb);
end;
$$;

revoke all on function public.apply_tutorial_player_snapshot(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.apply_tutorial_enemy_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated;
