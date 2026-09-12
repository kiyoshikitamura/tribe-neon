-- ユーザー承認済み価格不具合修正。取得済み資産・率・Pool・無料権利は変更しない。
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
DO $fix$
DECLARE v_before jsonb; v_after jsonb; v_count integer;
BEGIN
  PERFORM id FROM public.gacha_masters WHERE id IN ('CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL') FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.gacha_masters
  WHERE id IN ('CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL') AND cost_cash IN (100,1000);
  IF v_count <> 3 THEN RAISE EXCEPTION 'Unexpected Normal master state; abort'; END IF;
  SELECT jsonb_agg(CASE WHEN id IN ('CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL') THEN to_jsonb(m)-'cost_cash' ELSE to_jsonb(m) END ORDER BY id)
  INTO v_before FROM public.gacha_masters m;
  UPDATE public.gacha_masters SET cost_cash=1000
  WHERE id IN ('CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL') AND cost_cash=100;
  SELECT jsonb_agg(CASE WHEN id IN ('CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL') THEN to_jsonb(m)-'cost_cash' ELSE to_jsonb(m) END ORDER BY id)
  INTO v_after FROM public.gacha_masters m;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'Unexpected master change; abort'; END IF;
  IF (SELECT count(*) FROM public.gacha_masters WHERE id IN ('CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL') AND cost_cash=1000) <> 3
  THEN RAISE EXCEPTION 'Normal cost verification failed'; END IF;
END $fix$;
SELECT clock_timestamp() AS applied_at_utc, id, cost_cash AS single_cash, cost_cash*10 AS ten_pull_cash
FROM public.gacha_masters WHERE id IN ('CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL') ORDER BY id;
COMMIT;
