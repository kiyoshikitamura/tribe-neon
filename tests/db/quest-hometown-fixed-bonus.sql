-- Preview用。キャラ育成値・実報酬・派遣を含む全検証変更をROLLBACKする。
begin;
set local statement_timeout='45s';
do $$
declare
 q record; c record; snap jsonb; low_snap jsonb; high_snap jsonb; j jsonb;
 p uuid; old_p uuid; old_snap jsonb; u uuid; base integer; old_cash bigint;
 after_cash bigint; before_items jsonb; after_items jsonb; before_ledger bigint; n integer:=0;
begin
 -- 全7街×3難度。Lv/覚醒を一時変更してLUK非依存も確認。
 for q in select * from canonical_quest_master where version='2026-08-30' and is_production_enabled loop
  select uc.*,m.hometown into c from user_characters uc join canonical_character_master m
   on m.version='2026-08-21' and m.character_id=uc.character_id
   where quest_town_key(m.hometown)=quest_town_key(q.town_id) limit 1;
  if not found then raise exception 'matching character fixture missing %',q.quest_id; end if;
  update user_characters set level=1,awakening_level=0 where id=c.id;
  low_snap:=quest_hometown_snapshot(c.user_id,c.id::text,q.quest_id);
  update user_characters set level=100,awakening_level=5 where id=c.id;
  high_snap:=quest_hometown_snapshot(c.user_id,c.id::text,q.quest_id);
  if (low_snap->>'cash')::bigint<>q.cash_reward/10 or (low_snap->>'drop_bonus_bp')::int<>200
   or not (low_snap->>'matched')::boolean or (low_snap->>'version')::int<>2
   or low_snap->>'cash' is distinct from high_snap->>'cash'
   or low_snap->>'drop_bonus_bp' is distinct from high_snap->>'drop_bonus_bp'
   or low_snap ? 'luk' then raise exception 'fixed bonus mismatch %',low_snap; end if;
  select uc.*,m.hometown into c from user_characters uc join canonical_character_master m
   on m.version='2026-08-21' and m.character_id=uc.character_id
   where quest_town_key(m.hometown)<>quest_town_key(q.town_id) limit 1;
  snap:=quest_hometown_snapshot(c.user_id,c.id::text,q.quest_id);
  if (snap->>'matched')::boolean or (snap->>'cash')::bigint<>0 or (snap->>'drop_bonus_bp')::int<>0 then raise exception 'unmatched bonus'; end if;
  n:=n+1;
 end loop;
 if n<>21 then raise exception 'expected 21 courses, got %',n; end if;
 -- 既存version1の実Snapshotで受取。新式へ再計算されないことを確認。
 select p0.id,p0.user_id,p0.hometown_bonus_snapshot,q0.cash_reward
 into old_p,u,old_snap,base from user_patrols p0 join canonical_quest_master q0
 on q0.version='2026-08-30' and q0.quest_id=coalesce(p0.course_id,p0.quest_id)
 where (p0.hometown_bonus_snapshot->>'version')::int=1 and q0.is_production_enabled
 and p0.status<>'COMPLETED' and (p0.hometown_bonus_snapshot->>'matched')::boolean limit 1;
 if old_p is null then raise exception 'existing old matched pending snapshot required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 update user_patrols set expires_at=now()-interval '1 second',battle_resolved=true,status='CLAIMABLE' where id=old_p;
 select cash into old_cash from users where id=u;
 j:=claim_patrol_rewards(old_p);
 if (j->>'cash')::bigint<>base+(old_snap->>'cash')::bigint or (j->>'hometown_drop_bonus_bp')::int<>(old_snap->>'drop_bonus_bp')::int
 or (select cash from users where id=u)<>old_cash+base+(old_snap->>'cash')::bigint
 or (select hometown_bonus_snapshot from user_patrols where id=old_p)<>old_snap then raise exception 'old snapshot not preserved'; end if;
 -- 実start RPC→INSERT triggerでversion2。開始後の成長でも不変。
 select uc.*,m.hometown into c from user_characters uc join canonical_character_master m
 on m.version='2026-08-21' and m.character_id=uc.character_id
 where not exists(select 1 from user_patrols p0 where p0.user_id=uc.user_id and p0.character_id=uc.character_id and p0.status<>'COMPLETED')
 and (select count(*) from user_patrols p0 where p0.user_id=uc.user_id and p0.status<>'COMPLETED')<5 limit 1;
 if not found then raise exception 'new dispatch fixture missing'; end if;
 u:=c.user_id; perform set_config('request.jwt.claim.sub',u::text,true);
 select * into q from canonical_quest_master where version='2026-08-30' and difficulty='EASY'
 and quest_town_key(town_id)=quest_town_key(c.hometown) and is_production_enabled limit 1;
 update users set vitality=100 where id=u;
 j:=start_patrol(q.quest_id,c.id::text); p:=(j->>'patrol_id')::uuid; snap:=j->'hometown_bonus_snapshot';
 if (snap->>'version')::int<>2 or (snap->>'cash')::int<>q.cash_reward/10 or (snap->>'drop_bonus_bp')::int<>200 then raise exception 'new start snapshot mismatch'; end if;
 update user_characters set level=50,awakening_level=3 where id=c.id;
 if (select hometown_bonus_snapshot from user_patrols where id=p)<>snap then raise exception 'new snapshot drift'; end if;
 update user_patrols set expires_at=now()-interval '1 second',battle_resolved=true,status='CLAIMABLE' where id=p;
 select cash into old_cash from users where id=u;
 j:=claim_patrol_rewards(p);
 select cash into after_cash from users where id=u;
 if after_cash-old_cash<>q.cash_reward+q.cash_reward/10 or (j->>'cash')::bigint<>q.cash_reward+q.cash_reward/10 or (j->>'hometown_drop_bonus_bp')::int<>200 then raise exception 'new claim mismatch'; end if;
 select coalesce(jsonb_object_agg(item_id,quantity),'{}') into before_items from user_items where user_id=u;
 select count(*) into before_ledger from gameplay_reward_delivery_ledger where user_id=u;
 begin perform claim_patrol_rewards(p); raise exception 'retry accepted'; exception when unique_violation then null; end;
 select coalesce(jsonb_object_agg(item_id,quantity),'{}') into after_items from user_items where user_id=u;
 if (select cash from users where id=u)<>after_cash or before_items<>after_items
 or (select count(*) from gameplay_reward_delivery_ledger where user_id=u)<>before_ledger then raise exception 'retry changed assets'; end if;
end $$;
select 'PASS: 21 matched/unmatched courses, LUK independence, old snapshot claim, new start/claim, retry no duplicate' result;
rollback;
