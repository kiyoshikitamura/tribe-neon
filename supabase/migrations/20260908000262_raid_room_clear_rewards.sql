-- 討伐本人Room1回。Present自動送付30日は救援共通の実装前提。数値設定は未投入。
begin;
create table public.raid_room_clear_reward_rules (
 difficulty text primary key references public.raid_room_difficulty_rules(difficulty),
 enabled boolean not null default false,
 minimum_contribution_damage bigint check(minimum_contribution_damage>=0),
 rule_version bigint not null default 1 check(rule_version>0)
);
insert into public.raid_room_clear_reward_rules(difficulty)
 select difficulty from public.raid_room_difficulty_rules;
create table public.raid_room_clear_reward_items (
 difficulty text not null references public.raid_room_clear_reward_rules(difficulty),
 item_id text not null check(length(btrim(item_id))>0),
 quantity integer not null check(quantity>0), primary key(difficulty,item_id)
);
create table public.raid_room_clear_rewards (
 room_id uuid not null, user_id uuid not null, primary key(room_id,user_id),
 foreign key(room_id,user_id) references public.raid_room_members(room_id,user_id),
 rule_version bigint not null,
 finalized_battles bigint not null, contribution_damage bigint not null,
 clear_gate jsonb not null,
 issued_at timestamptz not null, expires_at timestamptz not null,
 check(expires_at=issued_at+interval '30 days')
);
create table public.raid_room_clear_reward_grants (
 room_id uuid not null,user_id uuid not null,item_id text not null,quantity integer not null check(quantity>0),
 present_id uuid not null unique references public.presents(id),
 primary key(room_id,user_id,item_id),
 foreign key(room_id,user_id) references public.raid_room_clear_rewards(room_id,user_id)
);
alter table public.raid_room_clear_reward_rules enable row level security;
alter table public.raid_room_clear_reward_items enable row level security;
alter table public.raid_room_clear_rewards enable row level security;
alter table public.raid_room_clear_reward_grants enable row level security;
revoke all on public.raid_room_clear_reward_rules,public.raid_room_clear_reward_items,
 public.raid_room_clear_rewards,public.raid_room_clear_reward_grants from public,anon,authenticated,service_role;

-- 信頼済みRoom確定のlateFinalization=falseだけを集計。撃破打はfalseのため含む。
create function public._raid_room_clear_reward_progress_v1(p_room_id uuid,p_user_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_count bigint:=0;v_damage bigint:=0;v_status text;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id;
 select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
 from public.raid_damage_logs l
 join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
 join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.user_id=p_user_id and s.room_id=p_room_id
 join public.raid_room_members m on m.room_id=p_room_id and m.user_id=p_user_id
 where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=p_user_id
  and b.requester_user_id=p_user_id and b.source_reference_id=v_room.raid_boss_instance_id
  and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
  and b.official_context->>'roomId'=p_room_id::text
  and b.finalization_status='FINALIZED'
  and b.finalization_result->'lateFinalization'='false'::jsonb;
 if v_rule.minimum_contribution_damage is null then v_status:='unknown';
 elsif v_count>0 and v_damage>v_rule.minimum_contribution_damage and v_boss.outcome='DEFEAT_SUCCESS' then v_status:='succeeded';
 else v_status:='not_succeeded';end if;
 return jsonb_build_object('finalizedBattles',v_count,'contributionDamage',v_damage,
  'clearGate',jsonb_build_object('status',v_status,'ruleVersion',coalesce(v_rule.rule_version,1),
   'contributionDamage',v_damage,'minimumContributionDamage',v_rule.minimum_contribution_damage,
   'cleared',coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $$;

create function public._issue_raid_room_clear_rewards_v1(p_room_id uuid) returns integer
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_member record;v_item record;
 v_progress jsonb;v_items jsonb;v_issued timestamptz;v_present uuid;v_inserted integer;v_count integer:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 -- 呼出元finalizerはReplay→bossを保持済み。別Replay/Userの強いロックを取得しない。
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' then return 0;end if;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id for share;
 if not found or not v_rule.enabled or v_rule.minimum_contribution_damage is null then return 0;end if;
 perform 1 from public.raid_room_clear_reward_items where difficulty=v_room.difficulty_id for share;
 if not found then return 0;end if;
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity) order by item_id) into v_items
  from public.raid_room_clear_reward_items where difficulty=v_room.difficulty_id;
 for v_member in select user_id from public.raid_room_members where room_id=p_room_id order by user_id loop
  if exists(select 1 from public.raid_room_clear_rewards where room_id=p_room_id and user_id=v_member.user_id) then continue;end if;
  v_progress:=public._raid_room_clear_reward_progress_v1(p_room_id,v_member.user_id);
  if v_progress->'clearGate'->>'status' is distinct from 'succeeded' then continue;end if;
  v_issued:=clock_timestamp();
  insert into public.raid_room_clear_rewards(room_id,user_id,rule_version,
   finalized_battles,contribution_damage,clear_gate,issued_at,expires_at)
  values(p_room_id,v_member.user_id,v_rule.rule_version,
   (v_progress->>'finalizedBattles')::bigint,(v_progress->>'contributionDamage')::bigint,
   v_progress->'clearGate',v_issued,v_issued+interval '30 days') on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then continue;end if;
  for v_item in select * from jsonb_to_recordset(v_items) as item(item_id text,quantity integer) order by item_id loop
   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド討伐報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_CLEAR',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'ruleVersion',(v_progress->'clearGate'->>'ruleVersion')::bigint))
   returning id into v_present;
   insert into public.raid_room_clear_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);
  end loop;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

-- logsとReplay確定後に実行。CLEAR時はそれまでに条件達成した全参加者を再評価する。
-- 付与失敗は戦闘確定全体と同一transactionでROLLBACK。例外を握りつぶさない。
create function public.on_raid_room_clear_reward_finalized_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v_room uuid;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED'
  or new.battle_mode<>'RAID' or new.resolution_authority<>'RAID_SERVER' then return new;end if;
 select id into v_room from public.raid_rooms where raid_boss_instance_id=new.source_reference_id;
 if found then perform public._issue_raid_room_clear_rewards_v1(v_room);end if;
 return new;
end $$;
create trigger raid_room_clear_reward_finalized_v1
 after update of finalization_status on public.battle_replay_sessions
 for each row execute function public.on_raid_room_clear_reward_finalized_v1();

create function public.get_raid_room_clear_reward_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_saved public.raid_room_clear_rewards%rowtype;
 v_progress jsonb;v_items jsonb:='[]';v_status text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_saved from public.raid_room_clear_rewards where room_id=p_room_id and user_id=v_uid;
 if found then
  v_status:='issued';v_progress:=jsonb_build_object('clearGate',v_saved.clear_gate);
  select coalesce(jsonb_agg(jsonb_build_object('itemId',g.item_id,'quantity',g.quantity,
   'presentId',g.present_id,'presentStatus',p.status,'claimedAt',p.claimed_at,'expiresAt',p.expire_at) order by g.item_id),'[]') into v_items
  from public.raid_room_clear_reward_grants g join public.presents p on p.id=g.present_id and p.user_id=g.user_id
  where g.room_id=p_room_id and g.user_id=v_uid;
 else
  v_progress:=public._raid_room_clear_reward_progress_v1(p_room_id,v_uid);
  if v_progress->'clearGate'->>'status'='unknown' or not exists(
   select 1 from public.raid_room_clear_reward_rules r where r.difficulty=v_room.difficulty_id and r.enabled
    and exists(select 1 from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty)) then v_status:='unconfigured';
  elsif v_progress->'clearGate'->>'status'='succeeded' then v_status:='pending';
  else v_status:='not_eligible';end if;
 end if;
 return jsonb_build_object('roomId',p_room_id,'status',v_status,'clearGate',v_progress->'clearGate',
  'issuedAt',v_saved.issued_at,'expiresAt',v_saved.expires_at,'items',v_items);
end $$;
revoke all on function public._raid_room_clear_reward_progress_v1(uuid,uuid),
 public._issue_raid_room_clear_rewards_v1(uuid),public.on_raid_room_clear_reward_finalized_v1(),
 public.get_raid_room_clear_reward_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_raid_room_clear_reward_v1(uuid) to authenticated;

commit;
