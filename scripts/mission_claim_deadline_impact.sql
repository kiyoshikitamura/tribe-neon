BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout='8s';
SELECT jsonb_build_object(
  'expired_clear_rows',count(*) filter(where e.claim_deadline is not null and clock_timestamp()>=e.claim_deadline),
  'expired_clear_events',count(distinct e.id) filter(where e.claim_deadline is not null and clock_timestamp()>=e.claim_deadline),
  'future_deadline_clear_rows',count(*) filter(where e.claim_deadline is not null and clock_timestamp()<e.claim_deadline),
  'unlimited_clear_rows',count(*) filter(where e.claim_deadline is null)
) AS impact
FROM public.user_missions um JOIN public.missions m ON m.id=um.mission_id
JOIN public.mission_events e ON e.id=m.event_id
WHERE um.status='CLEAR' AND m.is_enabled;
ROLLBACK;
