-- 親が正規Startで取得したUUIDだけを入力。Supabase MCPなら全体を一度に実行。
-- 外部書込み/RPC呼出しなし。QA除外の変更はDB writer担当。
begin transaction read only;
with target as (select '<FRESH_USER_UUID>'::uuid as id)
select jsonb_build_object(
 'observed_at',clock_timestamp(),
 'auth',(select jsonb_build_object('id',u.id,'created_at',u.created_at,'anonymous',u.is_anonymous,'email_confirmed',u.email_confirmed_at is not null,'has_password',coalesce(u.encrypted_password,'')<>'') from auth.users u join target t on t.id=u.id),
 'tutorial',(select jsonb_agg(jsonb_build_object('user_id',p.user_id,'step_id',p.step_id)) from public.tutorial_progress p join target t on t.id=p.user_id),
 'receipt',(select to_jsonb(r) from private.initial_equipment_receipts r join target t on t.id=r.user_id),
 'equipment_ids',(select jsonb_agg(e.id order by e.id) from public.user_equipments e join target t on t.id=e.user_id),
 'replays',(select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'mode',b.battle_mode,'source_reference_id',b.source_reference_id,'winner',b.result->>'winner')) from public.battle_replay_sessions b join target t on t.id=b.requester_user_id),
 'qa_classification',(select jsonb_agg(jsonb_build_object('classification',c.classification,'valid_to',c.valid_to)) from public.kpi_account_classification_periods c join public.kpi_subjects s using(subject_id) join target t on t.id=s.source_user_id)
) as observation;
commit;
