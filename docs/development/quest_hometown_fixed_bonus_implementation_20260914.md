# 地元一致固定ボーナス 実装・検証

BASE SHA: 7dd916f60b66ac8175d93205fa4761460c63f13b
Preview DB: sufvuqdnqohpfzkwxohq
Production: NOT EXECUTED

## 変更
quest_hometown_snapshot(uuid,text,text)のみ更新。canonical Quest.cash_rewardから10%を計算しcashへ保存。Drop200bp。LUK計算・保存を廃止。署名、STABLE、Invoker、search_pathを維持し、既存権限/Trigger/claimは変更なし。現行の600/1200/2000では端数なし。
出発前UI説明を固定仕様へ更新し、旧LUKバッジを削除。進行中とResultはSnapshotの表示を維持。

## Migration対応
- Repository: 20260914170757_quest_hometown_fixed_bonus.sql（CLI生成）
- 実Preview適用: 20260914170951 quest_hometown_fixed_bonus
- 同一Migrationを再適用しない。既存ユーザー行の永続更新なし。

## Acceptance
- tests/db/quest-hometown-fixed-bonus.sql: 全21course一致/不一致、低Lv/最大Lvで同じcash/drop、旧version1実進行中Snapshotで受取、新規start RPC→version2→受取、成長後不変、再送でCASH/Item/ledger不変 PASS。
- tests/db/quest-hometown-rewards.sql: 7街正規化、2キャラ実報酬、一致/不一致、早期/未戦闘/他者/再送拒否、二重派遣拒否 PASS。
- tests/db/quest-hometown-drops.sql: 固定seedで新ボーナス範囲の追加drop、基礎0%除外、確定drop数量維持 PASS。
- 全試験はROLLBACK。Battleは解決済みfixtureにするため、実戦E2Eとは区別する。
- Typecheck PASS。Build/Preview配信結果は最終報告とcommit status参照。実機は他の残件とまとめる。

## 適用前後ハッシュ一致
- 全既存Snapshot: 9cee5cfcf4f74b7c3e7dc9809dfb7b4e
- Quest Master: ffc1c8faa617f8326ba635ca41b885e2
- Drop Master: 549f5362cfd8547934c9e27159481993
- claim_patrol_rewards: 4c83b8220cfa18a016196244fcb7a036

旧Snapshot一致の進行中Questは適用前7件。Migrationは関数更新のみで一括UPDATEを含まない。既存資産補正、LUK/Growth/Mission/Raid/Ranking変更なし。
