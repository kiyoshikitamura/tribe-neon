-- クエスト新進行の利用者単位有効化と移行。適用だけでは利用者を変更しない。
create table if not exists public.quest_progression_user_versions (
 user_id uuid primary key references public.users(id) on delete cascade,
 progression_version text not null,
 activated_at timestamptz not null default now(),
 migration_key text not null
);
alter table public.quest_progression_user_versions enable row level security;
create policy quest_progression_version_owner_read on public.quest_progression_user_versions
 for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.quest_progression_user_versions from public,anon,authenticated;
grant select on public.quest_progression_user_versions to authenticated;
grant all on public.quest_progression_user_versions to service_role;

create table public.quest_progression_migration_runs (
 migration_key text not null,
 user_id uuid not null references public.users(id) on delete cascade,
 progression_version text not null,
 cutoff_at timestamptz not null,
 compensation jsonb not null,
 compensation_scope text not null,
 old_first_clears jsonb not null default '[]',
 result jsonb,
 completed_at timestamptz,
 primary key(migration_key,user_id),
 unique(user_id,progression_version)
);
create table public.quest_progression_migration_patrols (
 migration_key text not null,
 user_id uuid not null,
 patrol_id uuid not null,
 old_patrol jsonb not null,
 entitled boolean not null,
 reward_payload jsonb not null default '[]',
 primary key(migration_key,patrol_id),
 foreign key(migration_key,user_id) references public.quest_progression_migration_runs(migration_key,user_id)
);
-- 新Master差し替え後でも旧探索の受取権利を同じ基準で保全する。
create table public.quest_progression_legacy_reward_master (
 quest_id text primary key,
 quest_snapshot jsonb not null,
 pool_snapshot jsonb not null
);
insert into public.quest_progression_legacy_reward_master(quest_id,quest_snapshot,pool_snapshot)
select q.quest_id,to_jsonb(q),coalesce((select jsonb_agg(to_jsonb(i) order by i.roll_index)
 from public.canonical_quest_reward_pool_items i
 where i.version=q.version and i.reward_pool_id=q.reward_pool_id),'[]'::jsonb)
from public.canonical_quest_master q where q.version='2026-08-30';

alter table public.quest_progression_migration_runs enable row level security;
alter table public.quest_progression_migration_patrols enable row level security;
alter table public.quest_progression_legacy_reward_master enable row level security;
revoke all on public.quest_progression_migration_runs,public.quest_progression_migration_patrols,
 public.quest_progression_legacy_reward_master from public,anon,authenticated;
grant all on public.quest_progression_migration_runs,public.quest_progression_migration_patrols,
 public.quest_progression_legacy_reward_master to service_role;

-- 運用者限定。対象は明示UUID配列、補填は明示JSON配列（ゼロも[]と指定）。
-- すべて1トランザクション。同一version再実行は結果を返すだけでリセットしない。
create or replace function public.migrate_quest_progression_v1(
 p_user_ids uuid[], p_migration_key text, p_cutoff_at timestamptz,
 p_compensation jsonb, p_compensation_scope text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid; v_patrol public.user_patrols%rowtype; v_master record;
 v_existing public.quest_progression_migration_runs%rowtype;
 v_reward jsonb; v_item jsonb; v_rewards jsonb; v_entitled boolean;
 v_cash bigint; v_xp integer; v_drop integer; v_index integer;
 v_retired integer; v_entitlements integer; v_presents integer; v_any_active boolean;
 v_summary jsonb:='[]'; v_result jsonb;
begin
 if p_user_ids is null or cardinality(p_user_ids)=0 or cardinality(p_user_ids)>1000
    or array_position(p_user_ids,null) is not null then
  raise exception 'Explicit user IDs required (1..1000)' using errcode='22023'; end if;
 if p_migration_key is null or btrim(p_migration_key)='' or p_cutoff_at is null
    or p_cutoff_at>clock_timestamp() then raise exception 'Migration key and nonfuture cutoff required' using errcode='22023';end if;
 if p_compensation is null or jsonb_typeof(p_compensation)<>'array'
    or p_compensation_scope is null or p_compensation_scope not in('ALL_TARGETS','ACTIVE_PATROLS') then
  raise exception 'Explicit compensation and scope required' using errcode='22023';end if;
 for v_item in select value from jsonb_array_elements(p_compensation) loop
  if jsonb_typeof(v_item)<>'object' or coalesce(v_item->>'item_id','')='' or
    coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]*$' or (v_item->>'quantity')::numeric>2147483647 then
   raise exception 'Invalid compensation payload' using errcode='22023';end if;
  if v_item->>'item_id'='PLAYER_XP' then raise exception 'Compensation XP is not an item';end if;
 end loop;
 for v_user in select distinct u from unnest(p_user_ids) u order by u loop
  -- 開始APIもusersロックを取る。移行中の新規探索開始と同時実行しない。
  perform 1 from public.users where id=v_user for update;
  if not found then raise exception 'Migration target missing' using errcode='P0002';end if;
  select * into v_existing from public.quest_progression_migration_runs
   where user_id=v_user and progression_version='2026-09-16';
  if found then
   if v_existing.migration_key<>p_migration_key or v_existing.compensation<>p_compensation
      or v_existing.cutoff_at<>p_cutoff_at or v_existing.compensation_scope<>p_compensation_scope then
    raise exception 'Migration inputs differ from completed run' using errcode='23514';end if;
   v_summary:=v_summary||jsonb_build_array(v_existing.result||jsonb_build_object('replayed',true));
   continue;
  end if;
  if exists(select 1 from public.quest_progression_user_versions where user_id=v_user) then
   raise exception 'User already activated; refusing to reset new progress' using errcode='23514';end if;
  -- cutoff後に作成された旧探索があると、対象漏れになるため明示的に再計画。
  if exists(select 1 from public.user_patrols where user_id=v_user
    and status not in('COMPLETED','MIGRATED') and started_at>p_cutoff_at) then
   raise exception 'Active patrol newer than cutoff' using errcode='23514';end if;
  insert into public.quest_progression_migration_runs(migration_key,user_id,progression_version,cutoff_at,compensation,compensation_scope,old_first_clears)
  values(p_migration_key,v_user,'2026-09-16',p_cutoff_at,p_compensation,p_compensation_scope,
   coalesce((select jsonb_agg(to_jsonb(c)) from public.user_quest_first_clears c where user_id=v_user),'[]'));
  v_retired:=0;v_entitlements:=0;v_presents:=0;v_any_active:=false;
  for v_patrol in select * from public.user_patrols where user_id=v_user
    and status not in('COMPLETED','MIGRATED') order by id for update loop
   v_any_active:=true;
   v_entitled:=(v_patrol.status='CLAIMABLE' or v_patrol.expires_at<=p_cutoff_at)
     and (not coalesce(v_patrol.has_battle_event,false)
       or (coalesce(v_patrol.battle_resolved,false) and v_patrol.battle_result='VICTORY'));
   v_entitled:=coalesce(v_entitled,false); v_rewards:='[]';
   if v_entitled then
    select * into v_master from public.quest_progression_legacy_reward_master
      where quest_id=coalesce(v_patrol.course_id,v_patrol.quest_id);
    if not found or v_patrol.base_cash_snapshot is null or v_patrol.hometown_bonus_snapshot is null then
     raise exception 'Legacy reward snapshot missing; refusing to discard entitlement' using errcode='23514';end if;
    v_cash:=v_patrol.base_cash_snapshot+(v_patrol.hometown_bonus_snapshot->>'cash')::bigint;
    v_xp:=(v_master.quest_snapshot->>'user_exp')::integer;
    v_drop:=(v_patrol.hometown_bonus_snapshot->>'drop_bonus_bp')::integer;
    if v_cash is null or v_cash<0 or v_cash>2147483647 or v_xp is null or v_xp<0 or v_drop is null then
     raise exception 'Invalid legacy reward snapshot' using errcode='23514';end if;
    if v_cash>0 then v_rewards:=v_rewards||jsonb_build_array(jsonb_build_object('item_id','CASH','quantity',v_cash));end if;
    if v_xp>0 then v_rewards:=v_rewards||jsonb_build_array(jsonb_build_object('item_id','PLAYER_XP','quantity',v_xp));end if;
    for v_item in select value from jsonb_array_elements(v_master.pool_snapshot) loop
     if (v_item->>'probability_bp')::integer>0 and floor(random()*10000)::integer<least(10000,(v_item->>'probability_bp')::integer+v_drop) then
      v_rewards:=v_rewards||jsonb_build_array(jsonb_build_object('item_id',public.resolve_canonical_reward_item(v_item->>'item_id'),'quantity',(v_item->>'quantity')::integer));
     end if;
    end loop;
    v_entitlements:=v_entitlements+1;
   end if;
   insert into public.quest_progression_migration_patrols(migration_key,user_id,patrol_id,old_patrol,entitled,reward_payload)
    values(p_migration_key,v_user,v_patrol.id,to_jsonb(v_patrol),v_entitled,v_rewards);
   v_index:=0;
   for v_reward in select value from jsonb_array_elements(v_rewards) loop
    v_index:=v_index+1;
    insert into public.presents(user_id,item_id,quantity,message,source_kind,source_key,source_metadata)
    values(v_user,v_reward->>'item_id',(v_reward->>'quantity')::integer,'クエスト更新：未受取報酬','QUEST_PROGRESSION_LEGACY',
      p_migration_key||':'||v_patrol.id::text||':'||v_index::text,
      jsonb_build_object('migration_key',p_migration_key,'patrol_id',v_patrol.id,'progression_version','2026-09-16'));
    v_presents:=v_presents+1;
   end loop;
   -- row自体は残してquest_raid_encounters FKと既存レイド参加状態を維持。
   update public.user_patrols set status='MIGRATED' where id=v_patrol.id;
   v_retired:=v_retired+1;
  end loop;
  delete from public.user_quest_first_clears where user_id=v_user;
  if p_compensation_scope='ALL_TARGETS' or v_any_active then
   v_index:=0;
   for v_reward in select value from jsonb_array_elements(p_compensation) loop
    v_index:=v_index+1;
    insert into public.presents(user_id,item_id,quantity,message,source_kind,source_key,source_metadata)
    values(v_user,public.resolve_canonical_reward_item(v_reward->>'item_id'),(v_reward->>'quantity')::integer,
      'クエスト更新：探索リセットのお詫び','QUEST_PROGRESSION_COMPENSATION',p_migration_key||':'||v_index::text,
      jsonb_build_object('migration_key',p_migration_key,'scope',p_compensation_scope));
    v_presents:=v_presents+1;
   end loop;
  end if;
  insert into public.quest_progression_user_versions(user_id,progression_version,migration_key)
   values(v_user,'2026-09-16',p_migration_key);
  v_result:=jsonb_build_object('retired_patrols',v_retired,'preserved_entitlements',v_entitlements,'presents_created',v_presents,'replayed',false);
  update public.quest_progression_migration_runs set result=v_result,completed_at=clock_timestamp()
   where migration_key=p_migration_key and user_id=v_user;
  v_summary:=v_summary||jsonb_build_array(v_result);
 end loop;
 return jsonb_build_object('status','success','progression_version','2026-09-16','results',v_summary);
end $$;
revoke all on function public.migrate_quest_progression_v1(uuid[],text,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.migrate_quest_progression_v1(uuid[],text,timestamptz,jsonb,text) to service_role;

-- 未受取XPをアイテム在庫に誤変換しない。移行元が確認できる場合のみXP付与。
create or replace function public.claim_present(p_present_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_present public.presents%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into v_present from public.presents where id=p_present_id and user_id=v_uid and status='UNCLAIMED'
  and (expire_at is null or expire_at>clock_timestamp()) for update;
 if not found then raise exception 'Present is not claimable';end if;
 if v_present.item_id='PLAYER_XP' then
  if v_present.source_kind is distinct from 'QUEST_PROGRESSION_LEGACY' then raise exception 'Unsupported XP source';end if;
  perform public.apply_user_xp(v_uid,v_present.quantity);
 else perform public.grant_present_payload(v_uid,v_present.item_id,v_present.quantity);end if;
 update public.presents set status='CLAIMED',claimed_at=clock_timestamp() where id=v_present.id;
 return jsonb_build_object('status','success','present_id',v_present.id);
end $$;
create or replace function public.claim_all_presents()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_present public.presents%rowtype; v_count integer:=0;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 for v_present in select * from public.presents where user_id=v_uid and status='UNCLAIMED'
  and (expire_at is null or expire_at>clock_timestamp()) order by id for update loop
  perform public.claim_present(v_present.id);v_count:=v_count+1;
 end loop;
 return jsonb_build_object('status','success','claimed_count',v_count);
end $$;
revoke all on function public.claim_present(uuid),public.claim_all_presents() from public,anon;
grant execute on function public.claim_present(uuid),public.claim_all_presents() to authenticated;
notify pgrst,'reload schema';
