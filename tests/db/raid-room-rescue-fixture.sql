alter table public.users add column avatar_url text;
create table if not exists public.social_activity_feed(
  id uuid primary key default gen_random_uuid(),
  activity_type text not null check(activity_type in ('SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT','POWER_RANK_1','GUILD_CREATED')),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_display_name text not null,
  guild_id uuid references public.guilds(id) on delete set null,
  object_master_id text,
  display_payload jsonb not null default '{}'::jsonb,
  permanent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists social_activity_feed_created_idx on public.social_activity_feed(created_at desc);
alter table public.social_activity_feed enable row level security;
drop policy if exists social_activity_feed_authenticated_read on public.social_activity_feed;
create policy social_activity_feed_authenticated_read on public.social_activity_feed for select to authenticated using(true);
revoke all on public.social_activity_feed from public,anon,authenticated;
grant select on public.social_activity_feed to authenticated;
CREATE TABLE IF NOT EXISTS public.board_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL DEFAULT 'STRATEGY_CHAT',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_avatar TEXT,
    author_character_id TEXT,
    replies_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS author_avatar_url TEXT;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.board_posts ALTER COLUMN title SET DEFAULT '';

CREATE INDEX IF NOT EXISTS board_posts_chat_target_created_at_idx ON public.board_posts (target_type, target_id, created_at ASC);


insert into guilds(id,name) values('00000000-0000-0000-0000-000000000101','検証Guild1'),('00000000-0000-0000-0000-000000000102','検証Guild2');
