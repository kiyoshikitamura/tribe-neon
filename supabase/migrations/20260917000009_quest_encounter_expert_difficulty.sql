begin;
alter table public.quest_raid_encounters drop constraint if exists quest_raid_encounters_difficulty_check;
alter table public.quest_raid_encounters add constraint quest_raid_encounters_difficulty_check check (difficulty in ('beginner','intermediate','advanced','expert'));
commit;
