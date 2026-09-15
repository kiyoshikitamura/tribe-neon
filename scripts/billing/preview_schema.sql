-- Lane C Preview候補。Supabase CLIが未取得のため正式migrationではない。
-- 適用先は sufvuqdnqohpfzkwxohq のみ。Productionへ適用しない。
-- 全RPCはservice_role専用 SECURITY INVOKER。ブラウザは認証付きserver APIを利用。
begin;

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
commit;
