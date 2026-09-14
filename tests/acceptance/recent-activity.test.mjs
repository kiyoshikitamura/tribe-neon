import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecentActivities, RECENT_ACTIVITY_WINDOW_MS } from '../../src/domain/social/recentActivity.ts';

const now = Date.parse('2026-09-14T08:00:00Z');
const row = (id, activity_type, timestamp = now) => ({ id, activity_type, created_at: new Date(timestamp).toISOString() });

test('9/14受入: 永続SSRキャラ取得と既存4種を表示しSkill/Equipment/一時通知を除外', () => {
  const allowed = ['SSR_CHARACTER', 'POWER_RANK_1', 'GUILD_CREATED', 'RAID_HELP_REQUEST', 'RAID_BOSS_DEFEATED'];
  const records = [...allowed, 'SSR_SKILL', 'SSR_EQUIPMENT', 'GACHA', 'REWARD', 'PREVIEW_ONLY'].map((type, i) => row(String(i), type));
  assert.deepEqual(new Set(normalizeRecentActivities(records, now).map(r => r.activity_type)), new Set(allowed));
});

test('SSRも24時間境界・未来時刻・不正日時・並び順の既存制限に従う', () => {
  const records = [row('old', 'SSR_CHARACTER', now - RECENT_ACTIVITY_WINDOW_MS - 1), row('boundary', 'SSR_CHARACTER', now - RECENT_ACTIVITY_WINDOW_MS), row('future', 'SSR_CHARACTER', now + 1), row('a', 'SSR_CHARACTER'), row('b', 'RAID_HELP_REQUEST'), { id: 'bad', activity_type: 'SSR_CHARACTER', created_at: 'invalid' }];
  assert.deepEqual(normalizeRecentActivities(records, now).map(r => r.id), ['b', 'a', 'boundary']);
});
