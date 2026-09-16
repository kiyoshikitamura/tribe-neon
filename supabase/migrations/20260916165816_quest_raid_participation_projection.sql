begin;
-- 発見時のowner/member登録だけでは参加済みにしない。「あとで」の入口を保持する。
-- 正式なbattle開始が成功しreplayとrequestが保存された時点を参加済みとする。
do $$
declare definition text; anchor text:='''expiresAt'',b.expires_at';
begin
 definition:=pg_get_functiondef('public.quest_raid_encounter_projection_v1(uuid)'::regprocedure);
 if position('''participated''' in definition)>0 then return; end if;
 if position(anchor in definition)=0 then raise exception 'quest raid projection anchor missing'; end if;
 definition:=replace(definition,anchor,
   '''participated'',exists(select 1 from public.raid_room_battle_start_requests started where started.room_id=e.room_id and started.user_id=e.user_id),''expiresAt'',b.expires_at');
 execute definition;
end $$;
commit;
