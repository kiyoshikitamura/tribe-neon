-- 統合fixtureのランキング周辺依存。250〜263本体は変更せず順次適用する。
-- 旧単機能fixtureのjsonb返却doubleは実既存型uuidに揃えるため取り除く。
drop function advance_ranking_season(text,timestamptz);
create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
create table ranking_seasons(id uuid primary key default gen_random_uuid(),ranking_type text,starts_at timestamptz,ends_at timestamptz,status text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(ranking_type,starts_at));
alter table raid_rewards_master add column reward_type text;
alter table user_items add column updated_at timestamptz;
create table pvp_daily_wins(user_id uuid,activity_date date,wins int);
create function canonical_ranking_reward_payload() returns jsonb language sql as $$select '{"progression":{"PVP":[[1,100,"CASH",7]]}}'::jsonb$$;
create function ranking_period_bounds(x text,t timestamptz) returns table(starts_at timestamptz,ends_at timestamptz) language sql as $$select date_trunc('month',t),date_trunc('month',t)+interval '1 month'$$;
create function assert_pvp_boundary_replay_continuity(uuid,timestamptz) returns void language sql as $$select$$;
create function finalize_pvp_season_rewards(uuid) returns integer language sql as $$select 0$$;
create function reconcile_pvp_after_season_boundary(uuid,timestamptz) returns void language sql as $$select$$;
