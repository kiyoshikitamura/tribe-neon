-- 9/12確定パック。既存Sandbox課金基盤を前提とする。販売公開は別工程。
begin;
alter table public.billing_products add column validity_days integer check(validity_days > 0);
insert into public.billing_products(id,title,amount_jpy,items,purchase_limit,validity_days) values
('beginner_pack_01','ビギナーパック',100,'[{"itemId":"CASH","quantity":1000},{"itemId":"SPECIAL_TICKET_CHARACTER","quantity":1},{"itemId":"SPECIAL_TICKET_SKILL","quantity":1},{"itemId":"SPECIAL_TICKET_EQUIPMENT","quantity":1},{"itemId":"RAID_POINT_TICKET","quantity":3}]',1,120),
('ticket_pack_01','チケットパック',1500,'[{"itemId":"SPECIAL_TICKET_CHARACTER","quantity":5},{"itemId":"SPECIAL_TICKET_SKILL","quantity":5},{"itemId":"SPECIAL_TICKET_EQUIPMENT","quantity":5}]',3,120),
('growth_pack_01','育成応援パック',500,'[{"itemId":"CHAR_EXP_L","quantity":30},{"itemId":"EQUIP_EXP_L","quantity":20},{"itemId":"CASH","quantity":10000}]',3,120),
('awakening_pack_01','覚醒応援パック',1000,'[{"itemId":"AWAKENING_BOOK","quantity":3},{"itemId":"SKILL_MANUAL","quantity":3},{"itemId":"EQUIP_LB_PART","quantity":3},{"itemId":"CASH","quantity":20000}]',3,120)
on conflict(id) do update set title=excluded.title,amount_jpy=excluded.amount_jpy,
 items=excluded.items,purchase_limit=excluded.purchase_limit,validity_days=excluded.validity_days;

create table public.billing_asset_lots (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.billing_orders(id),
 user_id uuid not null references public.users(id),
 present_id uuid not null unique references public.presents(id),
 item_id text not null, issued_quantity integer not null check(issued_quantity>0),
 remaining_quantity integer not null check(remaining_quantity>=0),
 issued_at timestamptz not null, expires_at timestamptz not null,
 claimed_at timestamptz, expired_quantity integer not null default 0 check(expired_quantity>=0),
 check(remaining_quantity+expired_quantity<=issued_quantity), check(expires_at>issued_at)
);
create index billing_asset_lots_consumption on public.billing_asset_lots(user_id,item_id,expires_at,id)
 where claimed_at is not null and remaining_quantity>0;
alter table public.billing_asset_lots enable row level security;
revoke all on public.billing_asset_lots from public,anon,authenticated;
grant select on public.billing_asset_lots to authenticated;
grant all on public.billing_asset_lots to service_role;
create policy billing_asset_lots_owner on public.billing_asset_lots for select to authenticated
 using ((select auth.uid())=user_id);

-- 既存無料在庫はロットへ変換しない。元の付与トランザクション内でPresentとロットを作る。
create or replace function public.billing_grant_order(p_order_id uuid,p_session_id text,p_amount_jpy integer,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_order public.billing_orders; v_item jsonb; v_id text; v_qty integer;
 v_present uuid; v_issued timestamptz:=clock_timestamp(); v_days integer;
begin
 select * into v_order from public.billing_orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if p_session_id !~ '^cs_test_[a-zA-Z0-9]+$' or p_amount_jpy is distinct from v_order.amount_jpy
 or p_currency is distinct from 'jpy' or (v_order.stripe_session_id is not null and v_order.stripe_session_id<>p_session_id)
 then raise exception 'PAYMENT_MISMATCH'; end if;
 if v_order.status='GRANTED' then return jsonb_build_object('status','GRANTED','duplicate',true,'order_id',p_order_id); end if;
 if v_order.status='EXPIRED' then raise exception 'ORDER_EXPIRED'; end if;
 v_days:=(v_order.product_snapshot->>'validity_days')::integer;
 -- 内訳未FIXのDIA商品や旧snapshotを新たな無期限付与へ流さない。
 if v_days is distinct from 120 then raise exception 'PAID_ASSET_CONTRACT_REQUIRED'; end if;
 perform 1 from public.users where id=v_order.user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 insert into public.billing_grants(order_id,stripe_session_id,user_id,items,created_at)
 values(p_order_id,p_session_id,v_order.user_id,v_order.product_snapshot->'items',v_issued);
 for v_item in select value from jsonb_array_elements(v_order.product_snapshot->'items') loop
  v_id:=v_item->>'itemId'; v_qty:=(v_item->>'quantity')::integer;
  if v_qty is null or v_qty<=0 or v_id in ('DIA','DIAMOND') then raise exception 'INVALID_PAID_ASSET'; end if;
  insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
  values(v_order.user_id,v_id,v_qty,'購入特典: '||(v_order.product_snapshot->>'title'),'UNCLAIMED',v_issued+interval '120 days') returning id into v_present;
  insert into public.billing_asset_lots(order_id,user_id,present_id,item_id,issued_quantity,remaining_quantity,issued_at,expires_at)
  values(p_order_id,v_order.user_id,v_present,v_id,v_qty,v_qty,v_issued,v_issued+interval '120 days');
 end loop;
 insert into public.payment_transactions(user_id,product_id,amount,currency,status)
 values(v_order.user_id,v_order.product_id,v_order.amount_jpy,'JPY','COMPLETED');
 insert into public.user_shop_purchases(user_id,product_id,purchase_count,last_purchased_at)
 values(v_order.user_id,v_order.product_id,1,v_issued) on conflict(user_id,product_id)
 do update set purchase_count=public.user_shop_purchases.purchase_count+1,last_purchased_at=excluded.last_purchased_at;
 update public.billing_orders set status='GRANTED',granted_at=v_issued,stripe_session_id=p_session_id where id=p_order_id;
 return jsonb_build_object('status','GRANTED','duplicate',false,'order_id',p_order_id);
end $$;

create function public.billing_mark_lot_claimed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='UNCLAIMED' and new.status='CLAIMED' then
  update public.billing_asset_lots set claimed_at=new.claimed_at where present_id=new.id and claimed_at is null;
 end if;
 return new;
end $$;
create trigger billing_present_claimed after update of status on public.presents
 for each row execute function public.billing_mark_lot_claimed();

-- 呼出元の資産行ロック→ロットロックの順。残高減算とロット消費を同一transactionにする。
create function public.billing_apply_lot_delta(p_user uuid,p_item text,p_old bigint,p_new bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_lot public.billing_asset_lots; v_expired bigint:=0; v_spend bigint:=greatest(p_old-p_new,0); v_take bigint;
begin
 for v_lot in select * from public.billing_asset_lots where user_id=p_user and item_id=p_item
 and claimed_at is not null and remaining_quantity>0 order by expires_at,id for update loop
  if v_lot.expires_at<=statement_timestamp() then
   v_expired:=v_expired+v_lot.remaining_quantity;
   update public.billing_asset_lots set expired_quantity=expired_quantity+remaining_quantity,remaining_quantity=0 where id=v_lot.id;
  end if;
 end loop;
 if p_old-v_expired<v_spend then raise exception 'EXPIRED_ASSET_BALANCE'; end if;
 for v_lot in select * from public.billing_asset_lots where user_id=p_user and item_id=p_item
 and claimed_at is not null and remaining_quantity>0 order by expires_at,id for update loop
  exit when v_spend=0;
  v_take:=least(v_spend,v_lot.remaining_quantity);
  update public.billing_asset_lots set remaining_quantity=remaining_quantity-v_take where id=v_lot.id;
  v_spend:=v_spend-v_take;
 end loop;
 return p_new-v_expired;
end $$;
create function public.billing_asset_balance_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='users' then
  new.cash:=public.billing_apply_lot_delta(old.id,'CASH',old.cash,new.cash);
 else
  new.quantity:=public.billing_apply_lot_delta(old.user_id,old.item_id,old.quantity,new.quantity);
 end if;
 return new;
end $$;
create trigger billing_cash_lots before update of cash on public.users
 for each row execute function public.billing_asset_balance_trigger();
create trigger billing_item_lots before update of quantity on public.user_items
 for each row execute function public.billing_asset_balance_trigger();

-- 表示の再同期用。受取前Presentは元のexpire_atで受取不可となる。
create function public.billing_refresh_paid_assets() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 update public.users set cash=cash where id=v_uid;
 update public.user_items set quantity=quantity where user_id=v_uid and item_id in
 (select item_id from public.billing_asset_lots where user_id=v_uid and claimed_at is not null and remaining_quantity>0);
 select coalesce(jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',remaining_quantity,'expires_at',expires_at,'claimed',claimed_at is not null) order by expires_at),'[]')
 into v_result from public.billing_asset_lots where user_id=v_uid and remaining_quantity>0 and expires_at>statement_timestamp();
 return jsonb_build_object('lots',v_result);
end $$;
revoke all on function public.billing_mark_lot_claimed(),public.billing_apply_lot_delta(uuid,text,bigint,bigint),public.billing_asset_balance_trigger(),public.billing_refresh_paid_assets() from public,anon,authenticated;
grant execute on function public.billing_refresh_paid_assets() to authenticated;
commit;
