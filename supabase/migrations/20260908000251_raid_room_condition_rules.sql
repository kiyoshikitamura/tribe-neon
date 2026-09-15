-- Raid Room条件判定の準備。権利付与・既存戦闘・報酬経路へは接続しない。
create table if not exists public.raid_room_difficulty_rules (
  difficulty text primary key check (difficulty in ('beginner', 'intermediate', 'advanced', 'expert')),
  minimum_power bigint,
  rescue_min_battles bigint check (rescue_min_battles >= 0),
  rescue_min_contribution_damage bigint check (rescue_min_contribution_damage >= 0),
  rule_version bigint not null default 1 check (rule_version > 0),
  constraint raid_room_difficulty_power_valid check (
    (difficulty = 'beginner' and minimum_power is null)
    or (difficulty <> 'beginner' and minimum_power is not null and minimum_power >= 0)
  )
);

alter table public.raid_room_difficulty_rules enable row level security;
revoke all on table public.raid_room_difficulty_rules from public, anon, authenticated;

-- 確定済み参加下限のみ登録する。救援候補値は採用せず未設定を維持する。
-- 再適用時に調整済み設定・版番号を上書きしない。
insert into public.raid_room_difficulty_rules
  (difficulty, minimum_power, rescue_min_battles, rescue_min_contribution_damage, rule_version)
values ('beginner', null, null, null, 1),
       ('intermediate', 160000, null, null, 1),
       ('advanced', 200000, null, null, 1),
       ('expert', 240000, null, null, 1)
on conflict (difficulty) do nothing;

create or replace function public._raid_room_power_gate_v1(p_difficulty text, p_power bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_minimum bigint;
  v_actual bigint := case when p_power >= 0 then p_power else null end;
  v_status text;
  v_reason text;
begin
  if p_difficulty is null or p_difficulty not in ('beginner', 'intermediate', 'advanced', 'expert') then
    v_status := 'unknown';
    v_reason := 'invalid_difficulty';
  else
    select r.minimum_power into v_minimum
      from public.raid_room_difficulty_rules r where r.difficulty = p_difficulty;
    if not found then
      v_status := 'unknown';
      v_reason := 'rule_unavailable';
    elsif v_minimum is null then
      -- 初級は総合力条件だけを通過。参加許可全体を意味しない。
      v_status := 'passed';
      v_reason := 'no_power_restriction';
    elsif v_actual is null then
      v_status := 'unknown';
      v_reason := case when p_power is null then 'power_unavailable' else 'invalid_power' end;
    elsif v_actual >= v_minimum then
      v_status := 'passed';
      v_reason := 'meets_minimum';
    else
      v_status := 'failed';
      v_reason := 'below_minimum';
    end if;
  end if;
  return jsonb_build_object('status', v_status, 'minimumPower', v_minimum,
    'actualPower', v_actual, 'reason', v_reason);
end;
$$;

create or replace function public._raid_room_rescue_gate_v1(
  p_difficulty text,
  p_via_rescue boolean,
  p_finalized_battles bigint,
  p_contribution_damage bigint,
  p_room_cleared boolean
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_rule public.raid_room_difficulty_rules%rowtype;
  v_status text := 'unknown';
  v_reason text;
begin
  if p_difficulty is null or p_difficulty not in ('beginner', 'intermediate', 'advanced', 'expert') then
    v_reason := 'invalid_difficulty';
  else
    select r.* into v_rule from public.raid_room_difficulty_rules r where r.difficulty = p_difficulty;
    if not found then
      v_reason := 'rule_unavailable';
    elsif v_rule.rescue_min_battles is null or v_rule.rescue_min_contribution_damage is null then
      v_reason := 'thresholds_unconfigured';
    elsif p_finalized_battles < 0 or p_contribution_damage < 0 then
      v_reason := 'invalid_input';
    elsif p_via_rescue is null or p_finalized_battles is null
      or p_contribution_damage is null or p_room_cleared is null then
      v_reason := 'input_unavailable';
    elsif p_via_rescue and p_room_cleared
      and p_finalized_battles >= v_rule.rescue_min_battles
      and p_contribution_damage >= v_rule.rescue_min_contribution_damage then
      v_status := 'succeeded';
      v_reason := 'conditions_met';
    else
      v_status := 'not_succeeded';
      v_reason := 'conditions_not_met';
    end if;
  end if;
  return jsonb_build_object('status', v_status, 'reason', v_reason,
    'ruleVersion', v_rule.rule_version,
    'minimumBattles', v_rule.rescue_min_battles,
    'minimumContributionDamage', v_rule.rescue_min_contribution_damage);
end;
$$;

revoke all on function public._raid_room_power_gate_v1(text, bigint) from public, anon, authenticated;
revoke all on function public._raid_room_rescue_gate_v1(text, boolean, bigint, bigint, boolean) from public, anon, authenticated;

comment on table public.raid_room_difficulty_rules is 'Raid Room条件設定。救援閾値の初期NULLは未設定。権利確定時は採用した設定版を別途保存する。';
comment on function public._raid_room_power_gate_v1(text, bigint) is '非公開の総合力条件判定。呼出側がサーバー正本を取得する必要があり、参加許可そのものではない。';
comment on function public._raid_room_rescue_gate_v1(text, boolean, bigint, bigint, boolean) is '非公開の救援AND条件判定。信頼済み確定集計のみを渡す。報酬権利の作成・付与は行わない。';
