-- Preview sufvuqdnqohpfzkwxohq 専用。Production実行禁止。
-- ショップ閲覧を公開する。PAYMENTとStripe有効化は変更しない。
begin;
update public.feature_operating_states
set state='OPEN', visibility=true, mutation_allowed=true,
    navigation_allowed=true, deep_link_allowed=true,
    reason_code='PREVIEW_SHOP_ACCEPTANCE_20260915', updated_at=now()
where feature_key='SHOP' and state='CLOSED';
select feature_key,state,visibility,navigation_allowed
from public.feature_operating_states where feature_key in ('SHOP','PAYMENT');
commit;
