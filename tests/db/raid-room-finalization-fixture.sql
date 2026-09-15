-- 旧Guild報酬付与の呼出しを記録。実Guild報酬計算そのものは対象外。
create function public.grant_canonical_guild_daily_exp(p_uid uuid,p_source text,p_ref uuid) returns jsonb language plpgsql set search_path=public as $$ begin insert into isolation_calls values('guild:'||p_source,p_uid);return '{}'::jsonb;end $$;
alter function public.evaluate_mission_progress(uuid,text,int) set search_path=public;
create table public.ranking_daily_participation(ranking_day_key date,ranking_type text,user_id uuid,finalized_count int,first_finalized_at timestamptz,last_finalized_at timestamptz,primary key(ranking_day_key,ranking_type,user_id));
-- 00229のranking lifecycle呼出し保持のみを検証。シーズン移行本体は対象外。
create function public.advance_ranking_season(p_type text,p_now timestamptz) returns jsonb language plpgsql set search_path=public as $$ begin insert into isolation_calls values('ranking:'||p_type,null);return '{}'::jsonb;end $$;
