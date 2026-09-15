-- Production課金候補。未適用。別承認・接続先検証後に単一transactionで実行。
-- Preview限定原本を変更せず、4段階を原子的に合成する。
-- app.billing_target_project は実行者の確認表明でありDB接続先を証明しない。
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$
begin
 if current_setting('app.billing_target_project',true) is distinct from 'ktpolnkyyfkowxdmijww' then raise exception 'PRODUCTION_TARGET_NOT_CONFIRMED'; end if;
 perform 1 from public.feature_operating_states where feature_key='MAINTENANCE' and state='MAINTENANCE' for update;
 if not found then raise exception 'PRODUCTION_MAINTENANCE_REQUIRED'; end if;
 if exists(select 1 from pg_tables where schemaname='public' and tablename like 'billing%') or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'billing%') then raise exception 'BILLING_ALREADY_OR_PARTIALLY_APPLIED_DO_NOT_REAPPLY'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.claim_all_presents()'))) is distinct from '4d25888ddccc3571bea583a0b4a4e188' then raise exception 'SHARED_FUNCTION_DRIFT: claim_all_presents()'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.claim_all_presents(uuid)'))) is distinct from 'b627add278fa3f93e72f7c9574aa9e95' then raise exception 'SHARED_FUNCTION_DRIFT: claim_all_presents(uuid)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.claim_present(uuid)'))) is distinct from '087cc231b3713064f63d6d82b4579738' then raise exception 'SHARED_FUNCTION_DRIFT: claim_present(uuid)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.claim_present(uuid,uuid)'))) is distinct from 'd5b68be10a35dc997b988ac0c7ab3b7d' then raise exception 'SHARED_FUNCTION_DRIFT: claim_present(uuid,uuid)'; end if;
end $guard$;
create temp table billing_preparation_states on commit drop as select jsonb_agg(to_jsonb(s) order by feature_key) snapshot from public.feature_operating_states s;

-- Reviewed source: scripts/billing/preview_schema.sql

create table public.billing_products (
  id text primary key, title text not null, amount_jpy integer, price_dia integer,
  items jsonb not null check(jsonb_typeof(items)='array'), purchase_limit integer not null default 0,
  check ((amount_jpy > 0 and price_dia is null) or (price_dia > 0 and amount_jpy is null))
);
create table public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id), request_id uuid not null,
  product_id text not null references public.billing_products(id), amount_jpy integer not null,
  product_snapshot jsonb not null, stripe_session_id text unique,
  status text not null default 'PENDING' check(status in ('PENDING','GRANTED','EXPIRED')),
  created_at timestamptz not null default now(), granted_at timestamptz,
  unique(user_id, request_id)
);
create index billing_orders_user_created on public.billing_orders(user_id,created_at desc);
create unique index billing_beginner_once on public.billing_orders(user_id,product_id)
  where product_id='beginner_pack_01' and status in ('PENDING','GRANTED');
create table public.billing_grants (
  order_id uuid primary key references public.billing_orders(id),
  stripe_session_id text not null unique, user_id uuid not null references public.users(id),
  items jsonb not null, created_at timestamptz not null default now()
);
create index billing_grants_user on public.billing_grants(user_id);
create table public.billing_shop_receipts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
  request_id uuid not null, product_id text not null references public.billing_products(id),
  price_dia integer not null, items jsonb not null, created_at timestamptz not null default now(),
  unique(user_id,request_id)
);

alter table public.billing_products enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_grants enable row level security;
alter table public.billing_shop_receipts enable row level security;
revoke all on public.billing_products,public.billing_orders,public.billing_grants,public.billing_shop_receipts from public,anon,authenticated;
grant all on public.billing_products,public.billing_orders,public.billing_grants,public.billing_shop_receipts to service_role;
grant select on public.billing_orders,public.billing_shop_receipts to authenticated;
create policy billing_orders_owner_read on public.billing_orders for select to authenticated using ((select auth.uid())=user_id);
create policy billing_shop_owner_read on public.billing_shop_receipts for select to authenticated using ((select auth.uid())=user_id);

insert into public.billing_products(id,title,amount_jpy,items,purchase_limit) values
('beginner_pack_01','ビギナーパック',100,'[{"itemId":"CASH","quantity":5000},{"itemId":"SPECIAL_TICKET_CHARACTER","quantity":3},{"itemId":"SPECIAL_TICKET_SKILL","quantity":3},{"itemId":"SPECIAL_TICKET_EQUIPMENT","quantity":3},{"itemId":"ENERGY_DRINK","quantity":5}]',1),
('diamond_300','DIA 300個',300,'[{"itemId":"DIAMOND","quantity":300}]',0),
('diamond_500','DIA 500個',500,'[{"itemId":"DIAMOND","quantity":500}]',0),
('diamond_1030','DIA 1,030個',1000,'[{"itemId":"DIAMOND","quantity":1030}]',0),
('diamond_2080','DIA 2,080個',2000,'[{"itemId":"DIAMOND","quantity":2080}]',0),
('diamond_5240','DIA 5,240個',5000,'[{"itemId":"DIAMOND","quantity":5240}]',0),
('diamond_10680','DIA 10,680個',10000,'[{"itemId":"DIAMOND","quantity":10680}]',0);
insert into public.billing_products(id,title,price_dia,items) values
('energy_1','エナジードリンク ×1',50,'[{"itemId":"ENERGY_DRINK","quantity":1}]'),
('energy_11','エナジードリンク ×11',500,'[{"itemId":"ENERGY_DRINK","quantity":11}]'),
('bp_1','ファイトチケット ×1',50,'[{"itemId":"PVP_POINT_TICKET","quantity":1}]'),
('bp_11','ファイトチケット ×11',500,'[{"itemId":"PVP_POINT_TICKET","quantity":11}]'),
('rp_1','レイドチケット ×1',50,'[{"itemId":"RAID_POINT_TICKET","quantity":1}]'),
('rp_11','レイドチケット ×11',500,'[{"itemId":"RAID_POINT_TICKET","quantity":11}]'),
('cash_3000','CASH 3,000',300,'[{"itemId":"CASH","quantity":3000}]'),
('cash_5200','CASH 5,200',500,'[{"itemId":"CASH","quantity":5200}]'),
('cash_10500','CASH 10,500',1000,'[{"itemId":"CASH","quantity":10500}]'),
('cash_32000','CASH 32,000',3000,'[{"itemId":"CASH","quantity":32000}]');

create function public.billing_reserve_order(p_user_id uuid,p_request_id uuid,p_product_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_product public.billing_products; v_order public.billing_orders;
begin
  perform 1 from public.users where id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  select * into v_order from public.billing_orders where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_order.product_id<>p_product_id then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(v_order);
  end if;
  select * into v_product from public.billing_products where id=p_product_id and amount_jpy>0;
  if not found then raise exception 'INVALID_PRODUCT'; end if;
  if v_product.purchase_limit>0 and (
    (select count(*) from public.billing_orders where user_id=p_user_id and product_id=p_product_id and status<>'EXPIRED')>=v_product.purchase_limit
    or coalesce((select purchase_count from public.user_shop_purchases where user_id=p_user_id and product_id=p_product_id),0)>=v_product.purchase_limit
  ) then raise exception 'PURCHASE_LIMIT'; end if;
  insert into public.billing_orders(user_id,request_id,product_id,amount_jpy,product_snapshot)
  values(p_user_id,p_request_id,p_product_id,v_product.amount_jpy,to_jsonb(v_product)) returning * into v_order;
  return to_jsonb(v_order);
end $$;

create function public.billing_attach_session(p_order_id uuid,p_session_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_order public.billing_orders;
begin
  if p_session_id !~ '^cs_test_[a-zA-Z0-9]+$' then raise exception 'TEST_SESSION_REQUIRED'; end if;
  select * into v_order from public.billing_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.stripe_session_id is not null and v_order.stripe_session_id<>p_session_id then raise exception 'SESSION_CONFLICT'; end if;
  update public.billing_orders set stripe_session_id=p_session_id where id=p_order_id;
  return jsonb_build_object('order_id',p_order_id,'status',v_order.status);
end $$;

create function public.billing_grant_order(p_order_id uuid,p_session_id text,p_amount_jpy integer,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_order public.billing_orders; v_item jsonb; v_id text; v_qty integer;
begin
  -- サーバーが署名・決済状態・注文情報を検証済み。全付与を同一トランザクションで行う。
  select * into v_order from public.billing_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_session_id !~ '^cs_test_[a-zA-Z0-9]+$' or p_amount_jpy is distinct from v_order.amount_jpy
    or p_currency is distinct from 'jpy' or (v_order.stripe_session_id is not null and v_order.stripe_session_id<>p_session_id)
    then raise exception 'PAYMENT_MISMATCH'; end if;
  if v_order.status='GRANTED' then return jsonb_build_object('status','GRANTED','duplicate',true,'order_id',p_order_id); end if;
  if v_order.status='EXPIRED' then raise exception 'ORDER_EXPIRED'; end if;
  perform 1 from public.users where id=v_order.user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  insert into public.billing_grants(order_id,stripe_session_id,user_id,items)
    values(p_order_id,p_session_id,v_order.user_id,v_order.product_snapshot->'items');
  for v_item in select value from jsonb_array_elements(v_order.product_snapshot->'items') loop
    v_id:=v_item->>'itemId'; v_qty:=(v_item->>'quantity')::integer;
    if v_qty is null or v_qty<=0 then raise exception 'INVALID_QUANTITY'; end if;
    insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
      values(v_order.user_id,v_id,v_qty,'購入特典: '||(v_order.product_snapshot->>'title'),'UNCLAIMED',null);
  end loop;
  insert into public.payment_transactions(user_id,product_id,amount,currency,status)
    values(v_order.user_id,v_order.product_id,v_order.amount_jpy,'JPY','COMPLETED');
  insert into public.user_shop_purchases(user_id,product_id,purchase_count,last_purchased_at)
    values(v_order.user_id,v_order.product_id,1,now()) on conflict(user_id,product_id)
    do update set purchase_count=public.user_shop_purchases.purchase_count+1,last_purchased_at=now();
  update public.billing_orders set status='GRANTED',granted_at=now(),stripe_session_id=p_session_id where id=p_order_id;
  return jsonb_build_object('status','GRANTED','duplicate',false,'order_id',p_order_id);
end $$;

create function public.billing_expire_order(p_order_id uuid,p_session_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_order public.billing_orders;
begin
  select * into v_order from public.billing_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_session_id !~ '^cs_test_[a-zA-Z0-9]+$' or (v_order.stripe_session_id is not null and v_order.stripe_session_id<>p_session_id)
    then raise exception 'SESSION_CONFLICT'; end if;
  if v_order.status='PENDING' then update public.billing_orders set status='EXPIRED',stripe_session_id=p_session_id where id=p_order_id; end if;
  return jsonb_build_object('order_id',p_order_id);
end $$;

create function public.billing_buy_dia_product(p_user_id uuid,p_request_id uuid,p_product_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_product public.billing_products; v_receipt public.billing_shop_receipts; v_item jsonb; v_qty integer; v_id text;
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
  update public.users set neon_diamonds=neon_diamonds-v_product.price_dia where id=p_user_id and neon_diamonds>=v_product.price_dia;
  if not found then raise exception 'INSUFFICIENT_DIA'; end if;
  for v_item in select value from jsonb_array_elements(v_product.items) loop
    v_id:=v_item->>'itemId'; v_qty:=(v_item->>'quantity')::integer;
    if v_qty is null or v_qty<=0 then raise exception 'INVALID_QUANTITY'; end if;
    insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
      values(p_user_id,v_id,v_qty,'ショップ購入: '||v_product.title,'UNCLAIMED',null);
  end loop;
  insert into public.billing_shop_receipts(user_id,request_id,product_id,price_dia,items)
    values(p_user_id,p_request_id,p_product_id,v_product.price_dia,v_product.items) returning * into v_receipt;
  return jsonb_build_object('success',true,'duplicate',false,'receipt_id',v_receipt.id);
end $$;

revoke all on function public.billing_reserve_order(uuid,uuid,text),public.billing_attach_session(uuid,text),
  public.billing_grant_order(uuid,text,integer,text),public.billing_expire_order(uuid,text),
  public.billing_buy_dia_product(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.billing_reserve_order(uuid,uuid,text),public.billing_attach_session(uuid,text),
  public.billing_grant_order(uuid,text,integer,text),public.billing_expire_order(uuid,text),
  public.billing_buy_dia_product(uuid,uuid,text) to service_role;

-- Reviewed source: supabase/migrations/20260913105839_billing_paid_pack_lots.sql
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

-- Reviewed source: supabase/migrations/20260913111028_billing_checkout_mode_contract.sql
alter table public.billing_orders add column billing_mode text not null default 'sandbox'
 check(billing_mode in ('sandbox','live'));

create function public.billing_session_matches(p_order_id uuid,p_session_id text)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select case billing_mode when 'live' then p_session_id ~ '^cs_live_[a-zA-Z0-9]+$'
 else p_session_id ~ '^cs_test_[a-zA-Z0-9]+$' end from public.billing_orders where id=p_order_id),false)
$$;

create function public.billing_reserve_order(p_user_id uuid,p_request_id uuid,p_product_id text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_existing public.billing_orders; v_result jsonb;
begin
 if p_mode is null or p_mode not in ('sandbox','live') then raise exception 'BILLING_MODE_INVALID'; end if;
 perform 1 from public.users where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 select * into v_existing from public.billing_orders where user_id=p_user_id and request_id=p_request_id;
 if found and v_existing.billing_mode<>p_mode then raise exception 'BILLING_MODE_CONFLICT'; end if;
 v_result:=public.billing_reserve_order(p_user_id,p_request_id,p_product_id);
 if v_existing.id is null then
  update public.billing_orders set billing_mode=p_mode where id=(v_result->>'id')::uuid;
 end if;
 return v_result||jsonb_build_object('billing_mode',p_mode);
end $$;

create or replace function public.billing_attach_session(p_order_id uuid,p_session_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_order public.billing_orders;
begin
 select * into v_order from public.billing_orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.billing_session_matches(p_order_id,p_session_id) then raise exception 'BILLING_MODE_CONFLICT'; end if;
 if v_order.stripe_session_id is not null and v_order.stripe_session_id<>p_session_id then raise exception 'SESSION_CONFLICT'; end if;
 update public.billing_orders set stripe_session_id=p_session_id where id=p_order_id;
 return jsonb_build_object('order_id',p_order_id,'status',v_order.status);
end $$;

do $migration$
declare v_name text; v_source text; v_old text:='p_session_id !~ ''^cs_test_[a-zA-Z0-9]+$''';
begin
 foreach v_name in array array['public.billing_grant_order(uuid,text,integer,text)','public.billing_expire_order(uuid,text)'] loop
  v_source:=pg_get_functiondef(v_name::regprocedure);
  if position(v_old in v_source)=0 then raise exception 'BILLING_MODE_PATCH_SOURCE_MISMATCH: %',v_name; end if;
  execute replace(v_source,v_old,'not public.billing_session_matches(p_order_id,p_session_id)');
 end loop;
end $migration$;
revoke all on function public.billing_session_matches(uuid,text),public.billing_reserve_order(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.billing_session_matches(uuid,text),public.billing_reserve_order(uuid,uuid,text,text) to service_role;

-- Reviewed source: supabase/migrations/20260913120945_billing_dia_approved_contract.sql
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

-- Final Preview definitions (gacha boundary excluded).
CREATE OR REPLACE FUNCTION public.billing_grant_order(p_order_id uuid, p_session_id text, p_amount_jpy integer, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$;
revoke all on function public.billing_grant_order(uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_grant_order(uuid,text,integer,text) to service_role;
CREATE OR REPLACE FUNCTION public.billing_dia_balance_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 new.neon_diamonds:=public.billing_apply_lot_delta(old.id,'DIAMOND',old.neon_diamonds,new.neon_diamonds);
 return new;
end $function$;
revoke all on function public.billing_dia_balance_trigger() from public,anon,authenticated,service_role;
grant execute on function public.billing_dia_balance_trigger() to service_role;
CREATE OR REPLACE FUNCTION public.billing_buy_dia_product(p_user_id uuid, p_request_id uuid, p_product_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$;
revoke all on function public.billing_buy_dia_product(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_buy_dia_product(uuid,uuid,text) to service_role;
CREATE OR REPLACE FUNCTION public.billing_mark_lot_claimed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if old.status='UNCLAIMED' and new.status='CLAIMED' then
  update public.billing_asset_lots set claimed_at=new.claimed_at where present_id=new.id and claimed_at is null;
 end if;
 return new;
end $function$;
revoke all on function public.billing_mark_lot_claimed() from public,anon,authenticated,service_role;
grant execute on function public.billing_mark_lot_claimed() to service_role;
CREATE OR REPLACE FUNCTION public.billing_asset_balance_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_table_name='users' then
  new.cash:=public.billing_apply_lot_delta(old.id,'CASH',old.cash,new.cash);
 else
  new.quantity:=public.billing_apply_lot_delta(old.user_id,old.item_id,old.quantity,new.quantity);
 end if;
 return new;
end $function$;
revoke all on function public.billing_asset_balance_trigger() from public,anon,authenticated,service_role;
grant execute on function public.billing_asset_balance_trigger() to service_role;
CREATE OR REPLACE FUNCTION public.billing_reserve_order(p_user_id uuid, p_request_id uuid, p_product_id text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_existing public.billing_orders; v_result jsonb;
begin
 if p_mode is null or p_mode not in ('sandbox','live') then raise exception 'BILLING_MODE_INVALID'; end if;
 perform 1 from public.users where id=p_user_id for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 select * into v_existing from public.billing_orders where user_id=p_user_id and request_id=p_request_id;
 if found and v_existing.billing_mode<>p_mode then raise exception 'BILLING_MODE_CONFLICT'; end if;
 v_result:=public.billing_reserve_order(p_user_id,p_request_id,p_product_id);
 if v_existing.id is null then
  update public.billing_orders set billing_mode=p_mode where id=(v_result->>'id')::uuid;
 end if;
 return v_result||jsonb_build_object('billing_mode',p_mode);
end $function$;
revoke all on function public.billing_reserve_order(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_reserve_order(uuid,uuid,text,text) to service_role;
CREATE OR REPLACE FUNCTION public.billing_session_matches(p_order_id uuid, p_session_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce((select case billing_mode when 'live' then p_session_id ~ '^cs_live_[a-zA-Z0-9]+$'
 else p_session_id ~ '^cs_test_[a-zA-Z0-9]+$' end from public.billing_orders where id=p_order_id),false)
$function$;
revoke all on function public.billing_session_matches(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_session_matches(uuid,text) to service_role;
CREATE OR REPLACE FUNCTION public.billing_reserve_order(p_user_id uuid, p_request_id uuid, p_product_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_product public.billing_products; v_order public.billing_orders;
begin
  perform 1 from public.users where id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  select * into v_order from public.billing_orders where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_order.product_id<>p_product_id then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(v_order);
  end if;
  select * into v_product from public.billing_products where id=p_product_id and amount_jpy>0;
  if not found then raise exception 'INVALID_PRODUCT'; end if;
  if v_product.purchase_limit>0 and (
    (select count(*) from public.billing_orders where user_id=p_user_id and product_id=p_product_id and status<>'EXPIRED')>=v_product.purchase_limit
    or coalesce((select purchase_count from public.user_shop_purchases where user_id=p_user_id and product_id=p_product_id),0)>=v_product.purchase_limit
  ) then raise exception 'PURCHASE_LIMIT'; end if;
  insert into public.billing_orders(user_id,request_id,product_id,amount_jpy,product_snapshot)
  values(p_user_id,p_request_id,p_product_id,v_product.amount_jpy,to_jsonb(v_product)) returning * into v_order;
  return to_jsonb(v_order);
end $function$;
revoke all on function public.billing_reserve_order(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_reserve_order(uuid,uuid,text) to service_role;
CREATE OR REPLACE FUNCTION public.billing_attach_session(p_order_id uuid, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_order public.billing_orders;
begin
 select * into v_order from public.billing_orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.billing_session_matches(p_order_id,p_session_id) then raise exception 'BILLING_MODE_CONFLICT'; end if;
 if v_order.stripe_session_id is not null and v_order.stripe_session_id<>p_session_id then raise exception 'SESSION_CONFLICT'; end if;
 update public.billing_orders set stripe_session_id=p_session_id where id=p_order_id;
 return jsonb_build_object('order_id',p_order_id,'status',v_order.status);
end $function$;
revoke all on function public.billing_attach_session(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_attach_session(uuid,text) to service_role;
CREATE OR REPLACE FUNCTION public.billing_expire_order(p_order_id uuid, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_order public.billing_orders;
begin
  select * into v_order from public.billing_orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.billing_session_matches(p_order_id,p_session_id) or (v_order.stripe_session_id is not null and v_order.stripe_session_id<>p_session_id)
    then raise exception 'SESSION_CONFLICT'; end if;
  if v_order.status='PENDING' then update public.billing_orders set status='EXPIRED',stripe_session_id=p_session_id where id=p_order_id; end if;
  return jsonb_build_object('order_id',p_order_id);
end $function$;
revoke all on function public.billing_expire_order(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_expire_order(uuid,text) to service_role;
CREATE OR REPLACE FUNCTION public.billing_apply_lot_delta(p_user uuid, p_item text, p_old bigint, p_new bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;
revoke all on function public.billing_apply_lot_delta(uuid,text,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.billing_apply_lot_delta(uuid,text,bigint,bigint) to service_role;
CREATE OR REPLACE FUNCTION public.billing_refresh_paid_assets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 update public.users set cash=cash,neon_diamonds=neon_diamonds where id=v_uid;
 update public.user_items set quantity=quantity where user_id=v_uid and item_id in
 (select item_id from public.billing_asset_lots where user_id=v_uid and claimed_at is not null and remaining_quantity>0);
 select coalesce(jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',remaining_quantity,'expires_at',expires_at,'claimed',claimed_at is not null) order by expires_at),'[]')
 into v_result from public.billing_asset_lots where user_id=v_uid and remaining_quantity>0 and expires_at>statement_timestamp();
 return jsonb_build_object('lots',v_result,'dia_paid',coalesce((select sum(remaining_quantity) from public.billing_asset_lots where user_id=v_uid and item_id='DIAMOND' and claimed_at is not null and expires_at>statement_timestamp()),0),'dia_total',(select neon_diamonds from public.users where id=v_uid));
end $function$;
revoke all on function public.billing_refresh_paid_assets() from public,anon,authenticated,service_role;
grant execute on function public.billing_refresh_paid_assets() to service_role;
grant execute on function public.billing_refresh_paid_assets() to authenticated;

do $catalog$ begin if (select jsonb_agg(to_jsonb(p) order by id) from public.billing_products p) is distinct from '[{"amount_jpy": 1000, "id": "awakening_pack_01", "items": [{"itemId": "AWAKENING_BOOK", "quantity": 3}, {"itemId": "SKILL_MANUAL", "quantity": 3}, {"itemId": "EQUIP_LB_PART", "quantity": 3}, {"itemId": "CASH", "quantity": 20000}], "price_dia": null, "purchase_limit": 3, "title": "覚醒応援パック", "validity_days": 120}, {"amount_jpy": 100, "id": "beginner_pack_01", "items": [{"itemId": "CASH", "quantity": 1000}, {"itemId": "SPECIAL_TICKET_CHARACTER", "quantity": 1}, {"itemId": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"itemId": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"itemId": "RAID_POINT_TICKET", "quantity": 3}], "price_dia": null, "purchase_limit": 1, "title": "ビギナーパック", "validity_days": 120}, {"amount_jpy": null, "id": "bp_1", "items": [{"itemId": "PVP_POINT_TICKET", "quantity": 1}], "price_dia": 50, "purchase_limit": 0, "title": "ファイトチケット ×1", "validity_days": null}, {"amount_jpy": null, "id": "bp_11", "items": [{"itemId": "PVP_POINT_TICKET", "quantity": 11}], "price_dia": 500, "purchase_limit": 0, "title": "ファイトチケット ×11", "validity_days": null}, {"amount_jpy": null, "id": "cash_10500", "items": [{"itemId": "CASH", "quantity": 10500}], "price_dia": 1000, "purchase_limit": 0, "title": "CASH 10,500", "validity_days": null}, {"amount_jpy": null, "id": "cash_3000", "items": [{"itemId": "CASH", "quantity": 3000}], "price_dia": 300, "purchase_limit": 0, "title": "CASH 3,000", "validity_days": null}, {"amount_jpy": null, "id": "cash_32000", "items": [{"itemId": "CASH", "quantity": 32000}], "price_dia": 3000, "purchase_limit": 0, "title": "CASH 32,000", "validity_days": null}, {"amount_jpy": null, "id": "cash_5200", "items": [{"itemId": "CASH", "quantity": 5200}], "price_dia": 500, "purchase_limit": 0, "title": "CASH 5,200", "validity_days": null}, {"amount_jpy": 1000, "id": "diamond_1030", "items": [{"itemId": "DIAMOND", "quantity": 1000, "validity_days": 120}, {"itemId": "DIAMOND", "quantity": 30, "validity_days": null}], "price_dia": null, "purchase_limit": 0, "title": "DIA 1,030個", "validity_days": 120}, {"amount_jpy": 10000, "id": "diamond_10680", "items": [{"itemId": "DIAMOND", "quantity": 10000, "validity_days": 120}, {"itemId": "DIAMOND", "quantity": 680, "validity_days": null}], "price_dia": null, "purchase_limit": 0, "title": "DIA 10,680個", "validity_days": 120}, {"amount_jpy": 2000, "id": "diamond_2080", "items": [{"itemId": "DIAMOND", "quantity": 2000, "validity_days": 120}, {"itemId": "DIAMOND", "quantity": 80, "validity_days": null}], "price_dia": null, "purchase_limit": 0, "title": "DIA 2,080個", "validity_days": 120}, {"amount_jpy": 300, "id": "diamond_300", "items": [{"itemId": "DIAMOND", "quantity": 300, "validity_days": 120}], "price_dia": null, "purchase_limit": 0, "title": "DIA 300個", "validity_days": 120}, {"amount_jpy": 500, "id": "diamond_500", "items": [{"itemId": "DIAMOND", "quantity": 500, "validity_days": 120}], "price_dia": null, "purchase_limit": 0, "title": "DIA 500個", "validity_days": 120}, {"amount_jpy": 5000, "id": "diamond_5240", "items": [{"itemId": "DIAMOND", "quantity": 5000, "validity_days": 120}, {"itemId": "DIAMOND", "quantity": 240, "validity_days": null}], "price_dia": null, "purchase_limit": 0, "title": "DIA 5,240個", "validity_days": 120}, {"amount_jpy": null, "id": "energy_1", "items": [{"itemId": "ENERGY_DRINK", "quantity": 1}], "price_dia": 50, "purchase_limit": 0, "title": "エナジードリンク ×1", "validity_days": null}, {"amount_jpy": null, "id": "energy_11", "items": [{"itemId": "ENERGY_DRINK", "quantity": 11}], "price_dia": 500, "purchase_limit": 0, "title": "エナジードリンク ×11", "validity_days": null}, {"amount_jpy": 500, "id": "growth_pack_01", "items": [{"itemId": "CHAR_EXP_L", "quantity": 30}, {"itemId": "EQUIP_EXP_L", "quantity": 20}, {"itemId": "CASH", "quantity": 10000}], "price_dia": null, "purchase_limit": 3, "title": "育成応援パック", "validity_days": 120}, {"amount_jpy": null, "id": "rp_1", "items": [{"itemId": "RAID_POINT_TICKET", "quantity": 1}], "price_dia": 50, "purchase_limit": 0, "title": "レイドチケット ×1", "validity_days": null}, {"amount_jpy": null, "id": "rp_11", "items": [{"itemId": "RAID_POINT_TICKET", "quantity": 11}], "price_dia": 500, "purchase_limit": 0, "title": "レイドチケット ×11", "validity_days": null}, {"amount_jpy": 1500, "id": "ticket_pack_01", "items": [{"itemId": "SPECIAL_TICKET_CHARACTER", "quantity": 5}, {"itemId": "SPECIAL_TICKET_SKILL", "quantity": 5}, {"itemId": "SPECIAL_TICKET_EQUIPMENT", "quantity": 5}], "price_dia": null, "purchase_limit": 3, "title": "チケットパック", "validity_days": 120}]'::jsonb then raise exception 'CATALOG_DIFF_FROM_ACCEPTED_PREVIEW'; end if; end $catalog$;
do $postflight$ begin
if md5(pg_get_functiondef(to_regprocedure('public.claim_all_presents()'))) is distinct from '4d25888ddccc3571bea583a0b4a4e188' then raise exception 'SHARED_FUNCTION_DRIFT: claim_all_presents()'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.claim_all_presents(uuid)'))) is distinct from 'b627add278fa3f93e72f7c9574aa9e95' then raise exception 'SHARED_FUNCTION_DRIFT: claim_all_presents(uuid)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.claim_present(uuid)'))) is distinct from '087cc231b3713064f63d6d82b4579738' then raise exception 'SHARED_FUNCTION_DRIFT: claim_present(uuid)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.claim_present(uuid,uuid)'))) is distinct from 'd5b68be10a35dc997b988ac0c7ab3b7d' then raise exception 'SHARED_FUNCTION_DRIFT: claim_present(uuid,uuid)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_grant_order(uuid,text,integer,text)'))) is distinct from '0952ece6f383a9ec4c31100d64743523' then raise exception 'BILLING_FUNCTION_DIFF: billing_grant_order(uuid,text,integer,text)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_dia_balance_trigger()'))) is distinct from '47ac0f998c384df5cdfb24c61ef71cca' then raise exception 'BILLING_FUNCTION_DIFF: billing_dia_balance_trigger()'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_buy_dia_product(uuid,uuid,text)'))) is distinct from '15f8017189afbd663fa88b4a75a41bd3' then raise exception 'BILLING_FUNCTION_DIFF: billing_buy_dia_product(uuid,uuid,text)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_mark_lot_claimed()'))) is distinct from '4c31bdbb97350ca3063960c635ff3468' then raise exception 'BILLING_FUNCTION_DIFF: billing_mark_lot_claimed()'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_asset_balance_trigger()'))) is distinct from '88a372f96687301ae3161a6582502aa3' then raise exception 'BILLING_FUNCTION_DIFF: billing_asset_balance_trigger()'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_reserve_order(uuid,uuid,text,text)'))) is distinct from '1de7d894719b76a50d9b53983a472968' then raise exception 'BILLING_FUNCTION_DIFF: billing_reserve_order(uuid,uuid,text,text)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_session_matches(uuid,text)'))) is distinct from '23a222013c55091b2829c3c2ab0b8b21' then raise exception 'BILLING_FUNCTION_DIFF: billing_session_matches(uuid,text)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_reserve_order(uuid,uuid,text)'))) is distinct from 'ad671c4383edff65b6605b49eeba7783' then raise exception 'BILLING_FUNCTION_DIFF: billing_reserve_order(uuid,uuid,text)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_attach_session(uuid,text)'))) is distinct from '98183a65444a3fb0c5697af1dee472d0' then raise exception 'BILLING_FUNCTION_DIFF: billing_attach_session(uuid,text)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_expire_order(uuid,text)'))) is distinct from '70369c681e8db265fa09ff12425e981f' then raise exception 'BILLING_FUNCTION_DIFF: billing_expire_order(uuid,text)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_apply_lot_delta(uuid,text,bigint,bigint)'))) is distinct from '2f1b8adecf1727e7ff1c3b6260760d6e' then raise exception 'BILLING_FUNCTION_DIFF: billing_apply_lot_delta(uuid,text,bigint,bigint)'; end if;
if md5(pg_get_functiondef(to_regprocedure('public.billing_refresh_paid_assets()'))) is distinct from 'a11c703f0d5a71a455d1c1e07aecd56b' then raise exception 'BILLING_FUNCTION_DIFF: billing_refresh_paid_assets()'; end if;
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'billing%' and c.relkind='r' and c.relrowsecurity)<>5 then raise exception 'BILLING_RLS_MISSING'; end if;
 if exists(select 1 from public.billing_orders) or exists(select 1 from public.billing_grants) or exists(select 1 from public.billing_shop_receipts) or exists(select 1 from public.billing_asset_lots) then raise exception 'UNEXPECTED_BILLING_DATA'; end if;
end $postflight$;
do $states$ begin if (select jsonb_agg(to_jsonb(s) order by feature_key) from public.feature_operating_states s) is distinct from (select snapshot from billing_preparation_states) then raise exception 'OPERATIONS_STATE_CHANGED'; end if; end $states$;
commit;
