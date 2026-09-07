-- READ ONLY。Landing cohortを分母にし、未登録JourneyをLEFT JOINで残す。
-- 期間を変更して実行する。rateは0〜1、分母0はNULL。
with cohort as (
  select j.journey_id,j.metadata,
    bool_or(f.event_type='TITLE_ARRIVED') as title,
    bool_or(f.event_type='TAP_TO_START') as tap,
    bool_or(f.event_type='WORLD_INTRO_VIEWED') as viewed,
    bool_or(f.event_type='WORLD_INTRO_SKIPPED') as skipped
  from public.kpi_acquisition_journeys j
  left join public.kpi_acquisition_journey_facts f using(journey_id)
  where j.first_arrived_at >= '2026-09-07T00:00:00+09:00'::timestamptz
    and j.first_arrived_at < '2026-09-08T00:00:00+09:00'::timestamptz
    and j.source='web_v1'
  group by j.journey_id,j.metadata
), counts as (
  select coalesce(c.metadata->>'utm_source','unknown') source,
    c.metadata->>'utm_campaign' campaign,c.metadata->>'utm_content' creative,
    count(*) filter(where title) title_journeys,
    count(*) filter(where tap) tap_journeys,
    count(*) filter(where viewed) viewed_journeys,
    count(*) filter(where skipped) skipped_journeys,
    count(*) filter(where viewed and not skipped) non_skipped_journeys,
    count(distinct s.subject_id) game_start_subjects,
    count(distinct s.subject_id) filter(where viewed) viewed_game_start_subjects,
    count(distinct s.subject_id) filter(where skipped) skipped_game_start_subjects,
    count(distinct s.subject_id) filter(where viewed and not skipped) non_skipped_game_start_subjects
  from cohort c
  left join public.kpi_acquisition_subject_bindings b using(journey_id)
  left join public.kpi_subjects s on s.subject_id=b.subject_id
    and s.registered_at is not null
    and not public.kpi_is_subject_excluded(s.subject_id,s.registered_at)
  group by 1,2,3
)
select *,
  tap_journeys::numeric/nullif(title_journeys,0) title_to_tap,
  viewed_journeys::numeric/nullif(tap_journeys,0) tap_to_intro,
  skipped_journeys::numeric/nullif(viewed_journeys,0) intro_skip_rate,
  viewed_game_start_subjects::numeric/nullif(viewed_journeys,0) viewed_to_game_start,
  skipped_game_start_subjects::numeric/nullif(skipped_journeys,0) skipped_to_game_start,
  non_skipped_game_start_subjects::numeric/nullif(non_skipped_journeys,0) non_skipped_to_game_start
from counts order by source,campaign,creative;
