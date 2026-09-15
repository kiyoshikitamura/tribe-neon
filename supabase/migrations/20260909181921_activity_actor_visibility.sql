-- Presentation-only filter. Retain activity history and all KPI authorities.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_recent_social_activity_feed(p_limit integer DEFAULT 20)
RETURNS TABLE(
  id uuid, activity_type text, actor_user_id uuid, actor_display_name text,
  guild_id uuid, object_master_id text, display_payload jsonb,
  permanent boolean, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT feed.id, feed.activity_type, feed.actor_user_id, feed.actor_display_name,
         feed.guild_id, feed.object_master_id, feed.display_payload, feed.permanent, feed.created_at
  FROM public.social_activity_feed feed
  WHERE feed.created_at >= statement_timestamp() - interval '24 hours'
    AND feed.created_at <= statement_timestamp()
    -- ON DELETE SET NULL intentionally retains history; do not project a
    -- deleted person's cached name into the live player activity list.
    AND EXISTS (SELECT 1 FROM public.users actor WHERE actor.id = feed.actor_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.kpi_subjects subject
      JOIN public.kpi_account_classification_periods classification
        ON classification.subject_id = subject.subject_id
      WHERE subject.source_user_id = feed.actor_user_id
        AND classification.classification IN ('qa', 'test')
        AND classification.valid_from <= feed.created_at
        AND (classification.valid_to IS NULL OR feed.created_at < classification.valid_to)
    )
  ORDER BY feed.created_at DESC, feed.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
END;
$$;
-- Same signature/owner/ACL as the existing projection; no KPI mutation.
COMMIT;
