-- Restore of CLI-generated 20260913120945, never applied before recovery.
-- 2026-09-13 approved: paid DIA 120 days; bonus free; derived assets inherit original expiry.
begin;
do $$ begin if (select count(*) from public.billing_products where id in ('diamond_300','diamond_500','diamond_1030','diamond_2080','diamond_5240','diamond_10680'))<>6 then raise exception 'DIA_CATALOG_DEPENDENCY_MISSING'; end if; end $$;
alter table public.billing_asset_lots add column source_lot_id uuid references public.billing_asset_lots(id);
update public.billing_products set validity_days=120,items='[{"itemId": "DIAMOND", "quantity": 300, "validity_days": 120}]'::jsonb where id='diamond_300';
update public.billing_products set validity_days=120,items='[{"itemId": "DIAMOND", "quantity": 500, "validity_days": 120}]'::jsonb where id='diamond_500';
update public.billing_products set validity_days=120,items='[{"itemId": "DIAMOND", "quantity": 1000, "validity_days": 120}, {"itemId": "DIAMOND", "quantity": 30, "validity_days": null}]'::jsonb where id='diamond_1030';
update public.billing_products set validity_days=120,items='[{"itemId": "DIAMOND", "quantity": 2000, "validity_days": 120}, {"itemId": "DIAMOND", "quantity": 80, "validity_days": null}]'::jsonb where id='diamond_2080';
update public.billing_products set validity_days=120,items='[{"itemId": "DIAMOND", "quantity": 5000, "validity_days": 120}, {"itemId": "DIAMOND", "quantity": 240, "validity_days": null}]'::jsonb where id='diamond_5240';
update public.billing_products set validity_days=120,items='[{"itemId": "DIAMOND", "quantity": 10000, "validity_days": 120}, {"itemId": "DIAMOND", "quantity": 680, "validity_days": null}]'::jsonb where id='diamond_10680';
create or replace function public.billing_grant_order(p_order_id uuid,p_session_id text,p_amount_jpy integer,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_order public.billing_orders; v_item jsonb; v_id text; v_qty integer;
 v_present uuid; v_issued timestamptz:=clock_timestamp(); v_days integer; v_expiry timestamptz;
begin
 select * into v_order from public.billing_orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.billing_session_matches(p_order_id,p_session_id) or p_amount_jpy is distinct from v_order.amount_jpy
 or p_currency is distinct from 'jpy' or (v_order.stripe_session_id is not null and v_order.stripe_session_id<>p_session_id)
 then raise exception 'PAYMENT_MISMATCH'; end if;
 if v_order.status='GRANTED' then return jsonb_build_object('status','GRANTED','duplicate',true,'order_id',p_order_id); end if;
 if v_order.status='EXPIRED' then raise exception 'ORDER_EXPIRED'; end if;
 v_days:=(v_order.product_snapshot->>'validity_days')::integer;
 -- 120日期限のない旧snapshotを新規付与しない。
 if v_days is distinct from 120 then raise exception 'PAID_ASSET_CONTRACT_REQUIRED'; end if;
 perform 1 from public.users where id=v_order.user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 insert into public.billing_grants(order_id,stripe_session_id,user_id,items,created_at)
 values(p_order_id,p_session_id,v_order.user_id,v_order.product_snapshot->'items',v_issued);
 for v_item in select value from jsonb_array_elements(v_order.product_snapshot->'items') loop
  v_id:=v_item->>'itemId'; v_qty:=(v_item->>'quantity')::integer;
  if v_qty is null or v_qty<=0 or v_id='DIA' then raise exception 'INVALID_PAID_ASSET'; end if;
  v_expiry:=v_issued+interval '120 days';
  if v_id='DIAMOND' then
   if not (v_item ? 'validity_days') or ((v_item->>'validity_days')::integer is not null and (v_item->>'validity_days')::integer<>120) then raise exception 'DIA_CONTRACT_REQUIRED'; end if;
   if v_item->>'validity_days' is null then v_expiry:=null; end if;
  end if;
  insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
  values(v_order.user_id,v_id,v_qty,'購入特典: '||(v_order.product_snapshot->>'title'),'UNCLAIMED',v_expiry) returning id into v_present;
  if v_expiry is not null then
  insert into public.billing_asset_lots(order_id,user_id,present_id,item_id,issued_quantity,remaining_quantity,issued_at,expires_at)
  values(p_order_id,v_order.user_id,v_present,v_id,v_qty,v_qty,v_issued,v_expiry);
  end if;
 end loop;
 insert into public.payment_transactions(user_id,product_id,amount,currency,status)
 values(v_order.user_id,v_order.product_id,v_order.amount_jpy,'JPY','COMPLETED');
 insert into public.user_shop_purchases(user_id,product_id,purchase_count,last_purchased_at)
 values(v_order.user_id,v_order.product_id,1,v_issued) on conflict(user_id,product_id)
 do update set purchase_count=public.user_shop_purchases.purchase_count+1,last_purchased_at=excluded.last_purchased_at;
 update public.billing_orders set status='GRANTED',granted_at=v_issued,stripe_session_id=p_session_id where id=p_order_id;
 return jsonb_build_object('status','GRANTED','duplicate',false,'order_id',p_order_id);
end $$;

create function public.billing_dia_balance_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.neon_diamonds:=public.billing_apply_lot_delta(old.id,'DIAMOND',old.neon_diamonds,new.neon_diamonds);
 return new;
end $$;
create trigger billing_dia_lots before update of neon_diamonds on public.users for each row execute function public.billing_dia_balance_trigger();
revoke all on function public.billing_dia_balance_trigger() from public,anon,authenticated;
create or replace function public.billing_refresh_paid_assets() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 update public.users set cash=cash,neon_diamonds=neon_diamonds where id=v_uid;
 update public.user_items set quantity=quantity where user_id=v_uid and item_id in
 (select item_id from public.billing_asset_lots where user_id=v_uid and claimed_at is not null and remaining_quantity>0);
 select coalesce(jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',remaining_quantity,'expires_at',expires_at,'claimed',claimed_at is not null) order by expires_at),'[]')
 into v_result from public.billing_asset_lots where user_id=v_uid and remaining_quantity>0 and expires_at>statement_timestamp();
 return jsonb_build_object('lots',v_result,'dia_paid',coalesce((select sum(remaining_quantity) from public.billing_asset_lots where user_id=v_uid and item_id='DIAMOND' and claimed_at is not null and expires_at>statement_timestamp()),0),'dia_total',(select neon_diamonds from public.users where id=v_uid));
end $$;
-- Lock user balance, expire old DIA, snapshot sources, then consume through shared trigger.
create or replace function public.billing_buy_dia_product(p_user_id uuid,p_request_id uuid,p_product_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_product public.billing_products; v_receipt public.billing_shop_receipts; v_item jsonb;
 v_qty integer; v_id text; v_paid jsonb:='[]'; v_lot public.billing_asset_lots; v_remaining integer;
 v_take integer; v_segment jsonb; v_alloc integer; v_cumulative bigint; v_previous integer;
 v_present uuid;
begin
 perform 1 from public.users where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 select * into v_receipt from public.billing_shop_receipts where user_id=p_user_id and request_id=p_request_id;
 if found then
  if v_receipt.product_id<>p_product_id then raise exception 'REQUEST_CONFLICT'; end if;
  return jsonb_build_object('success',true,'duplicate',true,'receipt_id',v_receipt.id);
 end if;
 select * into v_product from public.billing_products where id=p_product_id and price_dia>0;
 if not found then raise exception 'INVALID_PRODUCT'; end if;
 update public.users set neon_diamonds=neon_diamonds where id=p_user_id;
 v_remaining:=v_product.price_dia;
 for v_lot in select * from public.billing_asset_lots where user_id=p_user_id and item_id='DIAMOND'
 and claimed_at is not null and remaining_quantity>0 and expires_at>statement_timestamp() order by expires_at,id for update loop
  exit when v_remaining=0;
  v_take:=least(v_remaining,v_lot.remaining_quantity);
  v_paid:=v_paid||jsonb_build_array(jsonb_build_object('id',v_lot.id,'order',v_lot.order_id,'quantity',v_take,'issued',v_lot.issued_at,'expiry',v_lot.expires_at));
  v_remaining:=v_remaining-v_take;
 end loop;
 update public.users set neon_diamonds=neon_diamonds-v_product.price_dia where id=p_user_id and neon_diamonds>=v_product.price_dia;
 if not found then raise exception 'INSUFFICIENT_DIA'; end if;
 for v_item in select value from jsonb_array_elements(v_product.items) loop
  v_id:=v_item->>'itemId'; v_qty:=(v_item->>'quantity')::integer;
  if v_qty is null or v_qty<=0 then raise exception 'INVALID_QUANTITY'; end if;
  v_cumulative:=0; v_previous:=0;
  for v_segment in select value from jsonb_array_elements(v_paid) loop
   v_cumulative:=v_cumulative+(v_segment->>'quantity')::bigint;
   v_alloc:=ceil(v_qty::numeric*v_cumulative/v_product.price_dia)::integer-v_previous;
   v_previous:=v_previous+v_alloc;
   if v_alloc>0 then
    insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
    values(p_user_id,v_id,v_alloc,'ショップ購入: '||v_product.title,'UNCLAIMED',(v_segment->>'expiry')::timestamptz) returning id into v_present;
    insert into public.billing_asset_lots(order_id,user_id,present_id,item_id,issued_quantity,remaining_quantity,issued_at,expires_at,source_lot_id)
    values((v_segment->>'order')::uuid,p_user_id,v_present,v_id,v_alloc,v_alloc,(v_segment->>'issued')::timestamptz,(v_segment->>'expiry')::timestamptz,(v_segment->>'id')::uuid);
   end if;
  end loop;
  if v_qty>v_previous then
   insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
   values(p_user_id,v_id,v_qty-v_previous,'ショップ購入: '||v_product.title,'UNCLAIMED',null);
  end if;
 end loop;
 insert into public.billing_shop_receipts(user_id,request_id,product_id,price_dia,items)
 values(p_user_id,p_request_id,p_product_id,v_product.price_dia,v_product.items) returning * into v_receipt;
 return jsonb_build_object('success',true,'duplicate',false,'receipt_id',v_receipt.id);
end $$;
commit;
