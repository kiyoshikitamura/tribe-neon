-- 対象Previewのみ。既存ユーザーを一時fixtureに使用。Flag/資産/抽選結果は全ROLLBACK。
begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
do $$
declare u uuid; gid text; currency_kind text; pulls integer; req uuid; first_result jsonb; retry_result jsonb;
  ticket_id text; dia_before bigint; dia_after bigint; ticket_before bigint; ticket_after bigint; history_before bigint;
  expected_cost integer; calls integer:=0;
begin
  -- 親がQA UUIDを指定する場合は、この選択だけQAに限定する。
  select id into u from public.users order by created_at desc limit 1;
  if u is null then raise exception 'NO_PREVIEW_FIXTURE'; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  update public.feature_operating_states set state='OPEN' where feature_key='SPECIAL_GACHA';
  if not found then raise exception 'SPECIAL_FEATURE_ROW_MISSING'; end if;
  update public.users set neon_diamonds=100000 where id=u;
  insert into public.user_items(user_id,item_id,quantity) values
    (u,'SPECIAL_TICKET_CHARACTER',100),(u,'SPECIAL_TICKET_SKILL',100),(u,'SPECIAL_TICKET_EQUIPMENT',100)
    on conflict(user_id,item_id) do update set quantity=100;
  foreach gid in array array['CHAR_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL'] loop
    ticket_id:=case gid when 'CHAR_SPECIAL' then 'SPECIAL_TICKET_CHARACTER' when 'SKILL_SPECIAL' then 'SPECIAL_TICKET_SKILL' else 'SPECIAL_TICKET_EQUIPMENT' end;
    expected_cost:=case gid when 'CHAR_SPECIAL' then 300 else 200 end;
    if (select cost_diamond from public.gacha_masters where id=gid)<>expected_cost then raise exception 'MASTER_PRICE_FAIL'; end if;
    foreach currency_kind in array array['diamonds','ticket'] loop
      foreach pulls in array array[1,10] loop
        req:=gen_random_uuid();
        select neon_diamonds into dia_before from public.users where id=u;
        select quantity into ticket_before from public.user_items where user_id=u and item_id=ticket_id;
        select count(*) into history_before from public.gacha_execution_history where user_id=u;
        if gid='CHAR_SPECIAL' then
          first_result:=public.execute_character_gacha(u,gid,pulls,currency_kind,req);
          retry_result:=public.execute_character_gacha(u,gid,pulls,currency_kind,req);
        else
          first_result:=public.execute_asset_gacha(u,gid,pulls,currency_kind,req);
          retry_result:=public.execute_asset_gacha(u,gid,pulls,currency_kind,req);
        end if;
        select neon_diamonds into dia_after from public.users where id=u;
        select quantity into ticket_after from public.user_items where user_id=u and item_id=ticket_id;
        if first_result is distinct from retry_result then raise exception 'RETRY_RESULT_FAIL: %/%/%',gid,currency_kind,pulls; end if;
        if (select count(*) from public.gacha_execution_history where user_id=u)<>history_before+1 then raise exception 'RETRY_HISTORY_FAIL'; end if;
        if currency_kind='diamonds' and (dia_before-dia_after<>expected_cost*pulls or ticket_before<>ticket_after) then raise exception 'DIA_CHARGE_FAIL'; end if;
        if currency_kind='ticket' and (ticket_before-ticket_after<>pulls or dia_before<>dia_after) then raise exception 'TICKET_CHARGE_FAIL'; end if;
        calls:=calls+1;
      end loop;
    end loop;
    foreach currency_kind in array array['cash','free',null::text] loop
      select neon_diamonds into dia_before from public.users where id=u;
      select count(*) into history_before from public.gacha_execution_history where user_id=u;
      begin
        if gid='CHAR_SPECIAL' then perform public.execute_character_gacha(u,gid,10,currency_kind,gen_random_uuid());
        else perform public.execute_asset_gacha(u,gid,10,currency_kind,gen_random_uuid()); end if;
        raise exception 'EXPECTED_SPECIAL_PAYMENT_REJECTION';
      exception when others then
        if currency_kind='free' and sqlerrm='daily free is only available as a normal ten-pull' then null;
        elsif sqlerrm='SPECIAL_REQUIRES_DIA_OR_TICKET' then null;
        else raise; end if;
      end;
      if (select neon_diamonds from public.users where id=u)<>dia_before
        or (select count(*) from public.gacha_execution_history where user_id=u)<>history_before then raise exception 'REJECTED_MUTATION_FAIL'; end if;
    end loop;
  end loop;
  if calls<>12 then raise exception 'TEST_COUNT_FAIL'; end if;
end $$;
select 'PASS: 3カテゴリ×DIA/Ticket×1/10連の12条件＋同request再送、CASH/FREE/NULL拒否' as result;
rollback;
