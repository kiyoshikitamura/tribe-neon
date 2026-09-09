# 第20工程 C — 本人貢献 Mock RPC

2026-09-08。担当 RAID-C-20、子の状態 IMPLEMENTED。親レビュー・全体型検証は親統合記録を参照。

## 変更

`src/utils/mock/mockRpc.ts` に `get_my_raid_contribution_v1` を追加した。基準は `20260908000261_raid_ranking_retirement.sql` の同名関数。

- Mock の既存認証表現 `tribe_demo_uuid` を本人として使い、未認証は `42501`。渡された `p_user_id` は本人識別に使わない。
- Instance 不在は `P0002`。
- Room は同一 Instance の本人ログ、旧 Raid は同一 `raid_day_key` に属する Instance の本人ログを合算する。SQL の NULL 日付比較は一致しない。
- 合算対象は `raw_damage`。`applied_damage` や旧 `damage` へのフォールバックは行わない。applied が 0 の確定ログも raw を参照する。
- `{ data: { contribution }, error: null }` を返し、順位・他人情報は返さない。保存更新なし。

## 検証

```sh
node --experimental-strip-types --test tests/raid-room/mock-contribution.test.mjs
```

6件 PASS / 0 FAIL。Room の本人・Instance 分離、raw と applied の区別、他ユーザー指定の無効化、旧 Raid 同日合算、NULL 日付、履歴なし 0、Instance 不在、未認証を確認。保存テーブル不変も確認。既存 Mock 検証と同じ `executeMockRpc` の直接実行で、Mock クライアントの保存層のみ fixture 化した。

Node の既存 package module type に関する警告あり。package.json は変更していない。

## 範囲と未確認

製品 SQL・認証 Authority・マスター・他 Mock ハンドラは変更していない。実 DB / Deploy / 実機確認ではない。

既存 `get_raid_rankings` / `get_raid_season_rankings` の Mock は順位を返すまま残っている。今回の限定タスクでは変更しておらず、製品の撤去済みランキング導線も復活させていない。数値精度は既存 Mock / JS number の範囲で、PostgreSQL bigint 全域の再現検証ではない。
