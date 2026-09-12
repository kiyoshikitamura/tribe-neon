-- 別候補。確率/Pool/Feature Flagは変更しない。適用前に既存ガチャ受入成果との整合を確認する。
begin;
create function public.billing_validate_special_payment()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- 抽選履歴の作成をDBの境界とし、Clientを介さない呼出しにも同じ制限を適用。
  -- 例外時は既存RPCの消費・抽選・付与も同一トランザクションでROLLBACK。
  if new.gacha_id in ('CHAR_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')
    and (new.payment_source is null or new.payment_source not in ('diamonds','ticket')) then
    raise exception 'SPECIAL_REQUIRES_DIA_OR_TICKET' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.billing_validate_special_payment() from public,anon,authenticated;
create trigger billing_special_payment_guard before insert or update of gacha_id,payment_source
  on public.gacha_execution_history for each row execute function public.billing_validate_special_payment();
update public.gacha_masters set cost_cash=0,cost_diamond=case id when 'CHAR_SPECIAL' then 300 else 200 end
where id in ('CHAR_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL');
commit;
