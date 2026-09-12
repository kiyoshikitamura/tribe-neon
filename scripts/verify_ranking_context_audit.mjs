import assert from 'node:assert/strict';
import { rankingNearbyOffset, rankingSelfStatusText } from '../src/domain/ranking/rankingSelfPresentation.ts';
import { rankingPeriodText } from '../src/domain/ranking/rankingPeriodPresentation.ts';
import { normalizeGuildRankingPayload } from '../src/domain/ranking/preopenGuildPowerSeason.ts';

// Six equal first places: self is sixth. Display rank must not drive the offset.
const six = Array.from({ length: 6 }, (_, i) => ({ guild_id: `g${i}`, rank_position: 1, row_position: i + 1 }));
const page = (all, own) => all.slice(rankingNearbyOffset(own), rankingNearbyOffset(own) + 5);
assert.equal(rankingNearbyOffset(six[5]), 3);
assert.ok(page(six, six[5]).includes(six[5]));
assert.deepEqual(page(six, six[5]).map(x => x.rank_position), [1, 1, 1]);
// Self beyond top100, with ties crossing the top100 boundary.
const many = Array.from({ length: 120 }, (_, i) => ({ guild_id: `g${i}`, rank_position: i < 98 ? i + 1 : 99, row_position: i + 1 }));
assert.equal(rankingNearbyOffset(many[105]), 103);
assert.ok(page(many, many[105]).includes(many[105]));
for (const invalid of [null, {}, { row_position: 0 }, { row_position: 2.5 }, { row_position: 'bad' }]) assert.equal(rankingNearbyOffset(invalid), null);
const normalized = normalizeGuildRankingPayload({ rows: [], self_guild: six[5], self_status: 'RANKED' });
assert.equal(normalized.selfRank.row_position, 6);
assert.equal(normalized.selfStatus, 'RANKED');
assert.equal(rankingSelfStatusText('DAILY_INACTIVE'), '本日の集計対象外');
assert.equal(rankingSelfStatusText('EXCLUDED'), '集計対象外');
assert.equal(rankingSelfStatusText('NO_PVP_RECORD'), 'バトル順位未登録');
assert.equal(rankingSelfStatusText(null), '順位情報なし');
assert.equal(rankingSelfStatusText('NEW_SERVER_CODE'), '順位情報なし');
const opts = { preopen: false, daily: false, now: Date.parse('2026-09-12T00:00:00Z'), format: v => v };
assert.equal(rankingPeriodText(null, opts), '集計期間情報なし');
assert.equal(rankingPeriodText(null, { ...opts, failed: true }), '集計期間を取得できませんでした');
assert.equal(rankingPeriodText({ status: 'ACTIVE', ends_at: '2099-12-30' }, { ...opts, preopen: true }), 'プレオープン中開催');
console.log('PASS: tied rank6, outside top100, missing row-position, proven self statuses, metadata failure vs missing');
