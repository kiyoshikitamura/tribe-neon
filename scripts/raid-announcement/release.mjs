import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const announcement = JSON.parse(fs.readFileSync(new URL('../../config/raid_release_announcement_20260909.json', import.meta.url), 'utf8'));
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const hash = createHash('sha256').update(announcement.event_key + ':global-system').digest('hex');
export const messageId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

// Generate a reviewed SQL artifact; this script never connects to any database.
// Run only after Raid publication. No future scheduling: the message is immediate.
export function publicationSql(publishedAt) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(publishedAt || '') || !Number.isFinite(Date.parse(publishedAt))) {
    throw new Error('Provide the confirmed Raid publication timestamp with timezone');
  }
  const {event_key, title, content, system_message} = announcement;
  return `-- Event: ${event_key}; run once after Raid publication. Safe to retry.
BEGIN;
SET LOCAL standard_conforming_strings = on;
SELECT pg_advisory_xact_lock(hashtextextended(${quote(event_key)}, 0));
DO $release$
DECLARE
  release_time timestamptz := ${quote(publishedAt)};
  existing public.news;
  sent public.board_posts;
BEGIN
  IF release_time > now() THEN RAISE EXCEPTION 'Raid publication must already be complete'; END IF;
  SELECT * INTO existing FROM public.news WHERE release_key = ${quote(event_key)};
  IF FOUND AND (existing.title IS DISTINCT FROM ${quote(title)} OR existing.content IS DISTINCT FROM ${quote(content)}) THEN
    RAISE EXCEPTION 'Existing announcement differs; stop and reconcile';
  END IF;
  SELECT * INTO sent FROM public.board_posts WHERE id = '${messageId}';
  IF FOUND THEN
    IF sent.content IS DISTINCT FROM ${quote(system_message)} OR sent.is_system IS DISTINCT FROM true
       OR sent.user_id IS NOT NULL OR sent.author_id IS NOT NULL OR sent.target_type IS DISTINCT FROM 'GLOBAL'
       OR sent.target_id IS NOT NULL OR existing.id IS NULL THEN
      RAISE EXCEPTION 'Release receipt mismatch; stop and reconcile';
    END IF;
    -- Never republish an operator-hidden announcement or reset its date on retry.
    RETURN;
  END IF;
  INSERT INTO public.news(category,title,content,start_at,created_at,is_published,release_key)
  VALUES ('INFO',${quote(title)},${quote(content)},release_time,release_time,true,${quote(event_key)})
  ON CONFLICT (release_key) DO UPDATE SET is_published=true,start_at=EXCLUDED.start_at,created_at=EXCLUDED.created_at;
  INSERT INTO public.board_posts(id,title,content,author_name,user_id,author_id,target_type,target_id,is_system)
  VALUES ('${messageId}','',${quote(system_message)},'System',NULL,NULL,'GLOBAL',NULL,true);
END
$release$;
COMMIT;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [publishedAt, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/raid-announcement/release.mjs <Raid-published-at-ISO> <output.sql>');
  fs.writeFileSync(output, publicationSql(publishedAt), {flag: 'wx'});
  console.log(`SQL prepared: ${output}; message ID: ${messageId}. Not executed.`);
}
