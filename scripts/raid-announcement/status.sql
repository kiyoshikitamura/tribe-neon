-- Read-only postflight / operator receipt check. Exactly one row expected after release.
SELECT n.release_key, n.title, n.is_published, n.start_at, n.end_at,
       (n.is_published AND n.start_at <= now() AND (n.end_at IS NULL OR n.end_at > now())) AS visible_now,
       p.id AS system_message_id, p.content AS system_message, p.created_at AS sent_at,
       p.is_system, p.target_type, p.target_id, p.user_id, p.author_id
FROM public.news n
LEFT JOIN public.board_posts p ON p.id = 'd0718b02-2747-54c6-a3ff-d517011a9a34'::uuid
WHERE n.release_key = 'raid_release_announcement_20260909';
