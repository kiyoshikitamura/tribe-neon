import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ids = ['beginner', 'intermediate', 'advanced', 'expert'];
const productionRef = 'ktpolnkyyfkowxdmijww';
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function integer(value, minimum, label) {
  requireValue(Number.isSafeInteger(value) && value >= minimum, `Invalid ${label}`);
  return value;
}
// E-string: quotes and backslashes are escaped independently of session settings.
function literal(value) { return "E'" + value.replaceAll('\\', '\\\\').replaceAll("'", "''") + "'"; }
function items(value, label) {
  requireValue(Array.isArray(value) && value.length > 0, `Missing ${label} items`);
  const seen = new Set();
  return value.map(item => {
    requireValue(item && typeof item.itemId === 'string' && item.itemId.trim() === item.itemId && item.itemId.length > 0 && !/[\u0000-\u001f\u007f]/u.test(item.itemId), `Invalid ${label} itemId`);
    requireValue(!seen.has(item.itemId), `Duplicate ${label} itemId`);
    seen.add(item.itemId);
    return { itemId: item.itemId, quantity: integer(item.quantity, 1, `${label} quantity`) };
  });
}

/** Generates a reviewable, rollback-only SQL file; never connects to a database. */
export function buildPreviewConfig(config) {
  requireValue(config?.environment === 'preview', 'Only preview configuration is supported');
  requireValue(typeof config.projectRef === 'string' && /^[a-z]{20}$/.test(config.projectRef) && config.projectRef !== productionRef, 'Independent Preview projectRef required');
  const version = integer(config.version, 1, 'version');
  requireValue(Array.isArray(config.difficulties) && config.difficulties.length === 4, 'All four difficulties required');
  const seen = new Set();
  const rows = config.difficulties.map(row => {
    requireValue(row && ids.includes(row.id) && !seen.has(row.id), 'Invalid or duplicate difficulty');
    seen.add(row.id);
    return { id: row.id,
      battles: integer(row.rescue?.minimumBattles, 1, 'rescue minimumBattles'),
      rescueDamage: integer(row.rescue?.minimumContributionDamage, 0, 'rescue minimumContributionDamage'),
      clearDamage: integer(row.clear?.minimumContributionDamage, 0, 'clear minimumContributionDamage'),
      rescueItems: items(row.rescue?.items, 'rescue'), clearItems: items(row.clear?.items, 'clear') };
  });
  const sql = [
    '-- Preview設定確認用。DB接続・適用・有効化は行わない。',
    `-- 対象候補 projectRef: ${config.projectRef} / version: ${version}`,
    '-- projectRefは識別用注記であり接続先を検証しない。実行者が接続先を照合する。',
    'BEGIN;', "SET LOCAL statement_timeout = '15s';", "SET LOCAL lock_timeout = '3s';",
    'SET LOCAL standard_conforming_strings = on;',
    'LOCK TABLE public.raid_room_difficulty_rules, public.raid_room_rescue_reward_rules, public.raid_room_clear_reward_rules, public.raid_room_rescue_reward_items, public.raid_room_clear_reward_items IN SHARE ROW EXCLUSIVE MODE;',
    "DO $$ BEGIN IF (SELECT count(*) FROM public.raid_room_difficulty_rules) <> 4 OR (SELECT count(*) FROM public.raid_room_rescue_reward_rules) <> 4 OR (SELECT count(*) FROM public.raid_room_clear_reward_rules) <> 4 THEN RAISE EXCEPTION 'Apply Raid migrations through 262 first'; END IF; END $$;"
  ];
  for (const row of rows) {
    const id = literal(row.id);
    sql.push(`UPDATE public.raid_room_difficulty_rules SET rescue_min_battles=${row.battles}, rescue_min_contribution_damage=${row.rescueDamage}, rule_version=${version} WHERE difficulty=${id};`);
    sql.push(`UPDATE public.raid_room_rescue_reward_rules SET enabled=false, reward_version=${version} WHERE difficulty=${id};`);
    sql.push(`UPDATE public.raid_room_clear_reward_rules SET enabled=false, minimum_contribution_damage=${row.clearDamage}, rule_version=${version} WHERE difficulty=${id};`);
    for (const kind of ['rescue', 'clear']) {
      const table = `public.raid_room_${kind}_reward_items`;
      sql.push(`DELETE FROM ${table} WHERE difficulty=${id};`);
      for (const item of row[`${kind}Items`]) sql.push(`INSERT INTO ${table}(difficulty,item_id,quantity) VALUES (${id},${literal(item.itemId)},${item.quantity});`);
    }
  }
  sql.push('SELECT * FROM public.raid_room_difficulty_rules ORDER BY difficulty;',
    'SELECT * FROM public.raid_room_rescue_reward_items ORDER BY difficulty,item_id;',
    'SELECT * FROM public.raid_room_clear_reward_rules ORDER BY difficulty;',
    'SELECT * FROM public.raid_room_clear_reward_items ORDER BY difficulty,item_id;',
    '-- 確認用は常にROLLBACK。永続適用・報酬有効化・Room公開は別手順。', 'ROLLBACK;', '');
  return sql.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireValue(process.argv.length === 3, 'Usage: node build-preview-config.mjs config.json');
    process.stdout.write(buildPreviewConfig(JSON.parse(readFileSync(process.argv[2], 'utf8'))));
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
