-- 公開設定は変更しない。注文ごとにStripe modeを固定し、test/live混在付与を拒否する。
begin;
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

-- 直前の購入ロット付与・既存期限処理を維持し、test専用条件だけmode照合へ置換。
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
commit;
