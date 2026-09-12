-- 対象Previewのみ。既存ユーザー1件をトランザクション内で使用し、必ず全ROLLBACK。
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

do $$
declare u uuid; req uuid:=gen_random_uuid(); o jsonb; again jsonb; paid jsonb;
  before_presents bigint; before_payments bigint; before_dia bigint; before_receipts bigint; shop_req uuid:=gen_random_uuid();
  second_order jsonb; limited_order jsonb; n integer; present_id uuid; broken_order jsonb; before_grants bigint;
begin
  select id into u from public.users where not exists(select 1 from public.user_shop_purchases s where s.user_id=users.id and s.product_id='beginner_pack_01')
    and not exists(select 1 from public.billing_orders b where b.user_id=users.id and b.product_id='beginner_pack_01' and b.status<>'EXPIRED') limit 1;
  if u is null then raise exception 'NO_ELIGIBLE_PREVIEW_FIXTURE'; end if;
  select count(*) into before_presents from public.presents where user_id=u;
  select count(*) into before_payments from public.payment_transactions where user_id=u;
  o:=public.billing_reserve_order(u,req,'diamond_300');
  again:=public.billing_reserve_order(u,req,'diamond_300');
  if o->>'id' is distinct from again->>'id' then raise exception 'RESERVE_RETRY_FAIL'; end if;
  if (select count(*) from public.presents where user_id=u)<>before_presents then raise exception 'UNPAID_GRANT_FAIL'; end if;
  raise notice 'PASS: 予約再送は同一注文・未決済配送なし';
  begin
    perform public.billing_reserve_order(u,req,'diamond_500');
    raise exception 'EXPECTED_REQUEST_CONFLICT';
  exception when others then if sqlerrm<>'REQUEST_CONFLICT' then raise; end if; end;
  perform public.billing_attach_session((o->>'id')::uuid,'cs_test_acceptanceA');
  begin
    perform public.billing_grant_order((o->>'id')::uuid,'cs_test_acceptanceA',1,'jpy');
    raise exception 'EXPECTED_AMOUNT_MISMATCH';
  exception when others then if sqlerrm<>'PAYMENT_MISMATCH' then raise; end if; end;
  if (select count(*) from public.presents where user_id=u)<>before_presents then raise exception 'MISMATCH_GRANT_FAIL'; end if;
  raise notice 'PASS: 商品変更再送・金額不一致は配送なし';
  paid:=public.billing_grant_order((o->>'id')::uuid,'cs_test_acceptanceA',300,'jpy');
  again:=public.billing_grant_order((o->>'id')::uuid,'cs_test_acceptanceA',300,'jpy');
  if paid->>'status'<>'GRANTED' or (again->>'duplicate')::boolean is not true then raise exception 'DUPLICATE_GRANT_FAIL'; end if;
  if (select count(*) from public.presents where user_id=u)<>before_presents+1 then raise exception 'PRESENT_COUNT_FAIL'; end if;
  if (select count(*) from public.payment_transactions where user_id=u)<>before_payments+1 then raise exception 'HISTORY_COUNT_FAIL'; end if;
  if not exists(select 1 from public.presents where user_id=u and item_id='DIAMOND' and quantity=300 and message='購入特典: DIA 300個' and expire_at is null) then raise exception 'PRESENT_CONTENT_FAIL'; end if;
  raise notice 'PASS: 決済再送でPresent・履歴は1回のみ、受取期限なし';
  select neon_diamonds into before_dia from public.users where id=u;
  select id into present_id from public.presents where user_id=u and item_id='DIAMOND' and quantity=300 and message='購入特典: DIA 300個' and expire_at is null order by sent_at desc limit 1;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform public.claim_present(present_id);
  if (select neon_diamonds from public.users where id=u)<>before_dia+300 then raise exception 'NULL_EXPIRY_CLAIM_FAIL'; end if;
  begin
    perform public.claim_present(present_id);
    raise exception 'EXPECTED_ALREADY_CLAIMED';
  exception when others then if sqlerrm<>'Present is not claimable' then raise; end if; end;
  raise notice 'PASS: 期限なしPresentの実受取・二重受取拒否';
  broken_order:=public.billing_reserve_order(u,gen_random_uuid(),'diamond_500');
  update public.billing_orders set product_snapshot=jsonb_set(product_snapshot,'{items}','[{"itemId":"CASH","quantity":1},{"itemId":"DIAMOND","quantity":0}]'::jsonb) where id=(broken_order->>'id')::uuid;
  select count(*) into before_grants from public.billing_grants where user_id=u;
  begin
    perform public.billing_grant_order((broken_order->>'id')::uuid,'cs_test_acceptanceBroken',500,'jpy');
    raise exception 'EXPECTED_INVALID_QUANTITY';
  exception when others then if sqlerrm<>'INVALID_QUANTITY' then raise; end if; end;
  if (select count(*) from public.billing_grants where user_id=u)<>before_grants or (select count(*) from public.presents where user_id=u)<>before_presents+1 then raise exception 'PARTIAL_GRANT_ROLLBACK_FAIL'; end if;
  raise notice 'PASS: 配送途中失敗のPresent/Grant全ROLLBACK';
  perform public.billing_expire_order((o->>'id')::uuid,'cs_test_acceptanceA');
  if (select status from public.billing_orders where id=(o->>'id')::uuid)<>'GRANTED' then raise exception 'GRANTED_DOWNGRADE_FAIL'; end if;
  limited_order:=public.billing_reserve_order(u,gen_random_uuid(),'beginner_pack_01');
  begin
    perform public.billing_reserve_order(u,gen_random_uuid(),'beginner_pack_01');
    raise exception 'EXPECTED_PURCHASE_LIMIT';
  exception when others then if sqlerrm<>'PURCHASE_LIMIT' then raise; end if; end;
  perform public.billing_expire_order((limited_order->>'id')::uuid,'cs_test_acceptanceExpired');
  second_order:=public.billing_reserve_order(u,gen_random_uuid(),'beginner_pack_01');
  if second_order->>'id'=limited_order->>'id' then raise exception 'EXPIRED_RETRY_FAIL'; end if;
  perform public.billing_grant_order((second_order->>'id')::uuid,'cs_test_acceptanceBeginner',100,'jpy');
  if (select count(*) from public.presents where user_id=u)<>before_presents+6 then raise exception 'BEGINNER_ITEMS_FAIL'; end if;
  raise notice 'PASS: Beginner多重注文拒否・期限終了後再注文・5種配送';
  update public.users set neon_diamonds=1000 where id=u;
  select count(*) into before_receipts from public.billing_shop_receipts where user_id=u;
  paid:=public.billing_buy_dia_product(u,shop_req,'rp_11');
  again:=public.billing_buy_dia_product(u,shop_req,'rp_11');
  if (select neon_diamonds from public.users where id=u)<>500 then raise exception 'DOUBLE_CHARGE_FAIL'; end if;
  if (select count(*) from public.billing_shop_receipts where user_id=u)<>before_receipts+1 then raise exception 'SHOP_RECEIPT_COUNT_FAIL'; end if;
  if (select count(*) from public.presents where user_id=u)<>before_presents+7 then raise exception 'SHOP_PRESENT_COUNT_FAIL'; end if;
  begin
    perform public.billing_buy_dia_product(u,gen_random_uuid(),'cash_32000');
    raise exception 'EXPECTED_INSUFFICIENT_DIA';
  exception when others then if sqlerrm<>'INSUFFICIENT_DIA' then raise; end if; end;
  if (select neon_diamonds from public.users where id=u)<>500 then raise exception 'FAILED_CHARGE_FAIL'; end if;
  raise notice 'PASS: DIA消費再送は1回・残高不足は無変更';
  if has_function_privilege('authenticated','public.billing_grant_order(uuid,text,integer,text)','EXECUTE')
    or has_function_privilege('anon','public.billing_grant_order(uuid,text,integer,text)','EXECUTE')
    or has_table_privilege('authenticated','public.billing_orders','INSERT') then raise exception 'UNTRUSTED_GRANT_ACCESS'; end if;
  raise notice 'PASS: 未認証・通常ユーザーからGrant/注文作成不可';
end $$;
select 'PASS: 予約再送、金額不一致、重複配送、Beginner制限/失効再注文、DIA消費再送/不足、権限拒否' as results;
rollback;
