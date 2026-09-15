-- Previewのみ。全てROLLBACK。監査用既存1ユーザーをトランザクション内で使用。
BEGIN;
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE free_rate_calls(mode text,gacha_id text);
CREATE OR REPLACE FUNCTION public.draw_daily_free_gacha_rarity(p_gacha_id text)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path TO 'public'
AS $$ DECLARE r text; BEGIN
 INSERT INTO pg_temp.free_rate_calls VALUES('daily',p_gacha_id);
 SELECT rarity INTO r FROM public.get_daily_free_gacha_rates() rates WHERE rates.gacha_id=p_gacha_id
 ORDER BY -ln(greatest(random(),0.000000000001))/weight LIMIT 1;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.draw_gacha_rarity(p_gacha_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE r text; BEGIN
 INSERT INTO pg_temp.free_rate_calls VALUES('normal',p_gacha_id);
 SELECT rarity INTO r FROM public.gacha_rarity_rates WHERE gacha_id=p_gacha_id
 ORDER BY -ln(greatest(random(),0.000000000001))/weight LIMIT 1;
 RETURN r;
END $$;
CREATE TEMP TABLE free_rate_results(test text,status text);
DO $test$
DECLARE
 u uuid; g text; kind text; currency text; req uuid; response jsonb; again jsonb;
 cash_before bigint; diamonds_before bigint; n integer; rejected boolean; target record;
BEGIN
 SELECT id INTO u FROM public.users WHERE EXISTS(SELECT 1 FROM auth.users a WHERE a.id=users.id) ORDER BY created_at LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'Preview QA user unavailable'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 DELETE FROM public.tutorial_progress WHERE user_id=u;
 UPDATE public.users SET cash=1000000,neon_diamonds=1000000 WHERE id=u;
 IF (SELECT count(*) FROM public.get_daily_free_gacha_rates())<>12
 OR EXISTS(SELECT 1 FROM public.get_daily_free_gacha_rates() GROUP BY gacha_id HAVING sum(weight)<>100)
 OR EXISTS(SELECT 1 FROM public.get_daily_free_gacha_rates() WHERE rarity='SSR' AND weight<>CASE gacha_id WHEN 'CHAR_NORMAL' THEN 0.3 ELSE 1 END)
 THEN RAISE EXCEPTION 'rate values mismatch'; END IF;
 INSERT INTO free_rate_results VALUES('exact daily rates','PASS');
 FOREACH g IN ARRAY ARRAY['CHAR_NORMAL','SKILL_NORMAL','EQUIP_NORMAL'] LOOP
   kind:=CASE g WHEN 'CHAR_NORMAL' THEN 'character' ELSE 'asset' END;
   DELETE FROM public.user_daily_gacha_claims WHERE user_id=u;
   TRUNCATE free_rate_calls;
   SELECT cash,neon_diamonds INTO cash_before,diamonds_before FROM public.users WHERE id=u;
   req:=gen_random_uuid();
   EXECUTE format('SELECT public.execute_%s_gacha($1,$2,10,''free'',$3,''daily-free-2026-09-12-v1'')',kind) INTO response USING u,g,req;
   IF jsonb_array_length(response->'results')<>10 OR response->>'rate_version'<>'daily-free-2026-09-12-v1'
      OR (SELECT count(*) FROM free_rate_calls WHERE mode='daily')<>10
      OR EXISTS(SELECT 1 FROM free_rate_calls WHERE mode<>'daily')
      OR EXISTS(SELECT 1 FROM public.users WHERE id=u AND (cash<>cash_before OR neon_diamonds<>diamonds_before))
   THEN RAISE EXCEPTION 'free result failed %',g; END IF;
   EXECUTE format('SELECT public.execute_%s_gacha($1,$2,10,''free'',$3,''daily-free-2026-09-12-v1'')',kind) INTO again USING u,g,req;
   IF again<>response OR (SELECT count(*) FROM free_rate_calls)<>10 THEN RAISE EXCEPTION 'retry grant failed'; END IF;
   -- 改定前レスポンスを保存した状況を再現し、旧版/旧RPCから再送しても再抽選しない。
   UPDATE public.gacha_execution_history SET result_payload=result_payload-'rate_version'
   WHERE user_id=u AND request_id=req;
   response:=response-'rate_version';
   EXECUTE format('SELECT public.execute_%s_gacha($1,$2,10,''free'',$3,''old-version'')',kind) INTO again USING u,g,req;
   IF again<>response OR (SELECT count(*) FROM free_rate_calls)<>10 THEN RAISE EXCEPTION 'old version completed retry failed'; END IF;
   EXECUTE format('SELECT public.execute_%s_gacha($1,$2,10,''free'',$3)',kind) INTO again USING u,g,req;
   IF again<>response OR (SELECT count(*) FROM free_rate_calls)<>10 THEN RAISE EXCEPTION '5arg completed retry failed'; END IF;
   rejected:=false;
   BEGIN
     EXECUTE format('SELECT public.execute_%s_gacha($1,$2,9,''free'',$3,''old-version'')',kind) USING u,g,req;
   EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%different gacha request%' THEN rejected:=true; ELSE RAISE; END IF; END;
   IF NOT rejected THEN RAISE EXCEPTION '6arg mismatched completed retry allowed'; END IF;
   rejected:=false;
   BEGIN
     EXECUTE format('SELECT public.execute_%s_gacha($1,$2,9,''free'',$3)',kind) USING u,g,req;
   EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%different gacha request%' THEN rejected:=true; ELSE RAISE; END IF; END;
   IF NOT rejected THEN RAISE EXCEPTION '5arg mismatched completed retry allowed'; END IF;
   INSERT INTO free_rate_results VALUES(g||' old-version/5arg completed replay + mismatch rejection','PASS');
   rejected:=false;
   BEGIN
     EXECUTE format('SELECT public.execute_%s_gacha($1,$2,10,''free'',$3,''daily-free-2026-09-12-v1'')',kind) USING u,g,gen_random_uuid();
   EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%daily free gacha already claimed%' THEN rejected:=true; ELSE RAISE; END IF; END;
   IF NOT rejected THEN RAISE EXCEPTION 'daily duplicate allowed'; END IF;
   rejected:=false;
   BEGIN
     EXECUTE format('SELECT public.execute_%s_gacha($1,$2,10,''free'',$3,''old-version'')',kind) USING u,g,gen_random_uuid();
   EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true; END;
   IF NOT rejected THEN RAISE EXCEPTION 'old version allowed'; END IF;
   rejected:=false;
   BEGIN
     EXECUTE format('SELECT public.execute_%s_gacha($1,$2,10,''free'',$3)',kind) USING u,g,gen_random_uuid();
   EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true; END;
   IF NOT rejected THEN RAISE EXCEPTION '5arg free allowed'; END IF;
   rejected:=false;
   BEGIN
     EXECUTE format('SELECT public.execute_%s_gacha($1,$2,10,''free'')',kind) USING u,g;
   EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true; END;
   IF NOT rejected THEN RAISE EXCEPTION '4arg free allowed'; END IF;
   rejected:=false;
   BEGIN
     EXECUTE format('SELECT public.execute_%s_gacha_core_20260812($1,$2,10,''free'')',kind) USING u,g;
   EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true; END;
   IF NOT rejected THEN RAISE EXCEPTION 'core free allowed'; END IF;
   INSERT INTO free_rate_results VALUES(g||' daily/retry/duplicate/version/legacy','PASS');
   FOREACH currency IN ARRAY ARRAY['cash','diamonds','ticket'] LOOP
     INSERT INTO public.user_items(user_id,item_id,quantity) VALUES(u,
       CASE g WHEN 'CHAR_NORMAL' THEN 'NORMAL_GACHA_TICKET_CHARACTER' WHEN 'SKILL_NORMAL' THEN 'NORMAL_GACHA_TICKET_SKILL' ELSE 'NORMAL_GACHA_TICKET_EQUIPMENT' END,100)
       ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=100;
     TRUNCATE free_rate_calls;
     req:=gen_random_uuid();
     EXECUTE format('SELECT public.execute_%s_gacha($1,$2,1,$3,$4)',kind) INTO response USING u,g,currency,req;
     IF jsonb_array_length(response->'results')<>1 OR (SELECT count(*) FROM free_rate_calls WHERE mode='normal')<>1
       OR EXISTS(SELECT 1 FROM free_rate_calls WHERE mode='daily') THEN RAISE EXCEPTION 'paid routing failed % %',g,currency; END IF;
     SELECT * INTO target FROM public.gacha_masters WHERE id=g;
     IF (SELECT cost_amount FROM public.gacha_execution_history WHERE user_id=u AND request_id=req)
        <> (CASE currency WHEN 'cash' THEN target.cost_cash WHEN 'diamonds' THEN target.cost_diamond ELSE 1 END)
     THEN RAISE EXCEPTION 'paid cost mismatch'; END IF;
     INSERT INTO free_rate_results VALUES(g||' '||currency||' existing rate/cost','PASS');
   END LOOP;
 END LOOP;
 -- 閉鎖中Specialは、このROLLBACKトランザクション内のみOPENにして率経路を確認。
 UPDATE public.feature_operating_states SET state='OPEN' WHERE feature_key='SPECIAL_GACHA';
 FOREACH g IN ARRAY ARRAY['CHAR_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL'] LOOP
   kind:=CASE g WHEN 'CHAR_SPECIAL' THEN 'character' ELSE 'asset' END;
   FOREACH currency IN ARRAY ARRAY['diamonds','ticket'] LOOP
     INSERT INTO public.user_items(user_id,item_id,quantity) VALUES(u,
       CASE g WHEN 'CHAR_SPECIAL' THEN 'SPECIAL_TICKET_CHARACTER' WHEN 'SKILL_SPECIAL' THEN 'SPECIAL_TICKET_SKILL' ELSE 'SPECIAL_TICKET_EQUIPMENT' END,100)
       ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=100;
     TRUNCATE free_rate_calls;
     EXECUTE format('SELECT public.execute_%s_gacha($1,$2,1,$3,$4)',kind) INTO response USING u,g,currency,gen_random_uuid();
     IF jsonb_array_length(response->'results')<>1 OR (SELECT count(*) FROM free_rate_calls WHERE mode='normal' AND gacha_id=g)<>1
       OR EXISTS(SELECT 1 FROM free_rate_calls WHERE mode='daily') THEN RAISE EXCEPTION 'Special routing failed % %',g,currency; END IF;
     INSERT INTO free_rate_results VALUES(g||' '||currency||' existing rate','PASS');
   END LOOP;
 END LOOP;
 DELETE FROM public.user_daily_gacha_claims WHERE user_id=u;
 DELETE FROM public.user_lifetime_onboarding_grants WHERE user_id=u;
 INSERT INTO public.tutorial_progress(user_id,step_id) VALUES(u,'FREE_GACHA');
 TRUNCATE free_rate_calls;
 req:=gen_random_uuid();
 response:=public.execute_tutorial_character_gacha(req);
 IF jsonb_array_length(response->'results')<>10
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(response->'results') r WHERE r->>'tutorial_slot'='10' AND r->>'rarity'='SSR')
   OR (SELECT count(*) FROM free_rate_calls WHERE mode='normal')<>9
   OR EXISTS(SELECT 1 FROM free_rate_calls WHERE mode='daily')
 THEN RAISE EXCEPTION 'tutorial boundary failed'; END IF;
 again:=public.execute_tutorial_character_gacha(req);
 IF again<>response OR (SELECT count(*) FROM free_rate_calls)<>9 THEN RAISE EXCEPTION 'tutorial retry failed'; END IF;
 INSERT INTO free_rate_results VALUES('Tutorial 9 original rate + SSR guarantee + retry','PASS');
END $test$;
SELECT * FROM free_rate_results;
ROLLBACK;

