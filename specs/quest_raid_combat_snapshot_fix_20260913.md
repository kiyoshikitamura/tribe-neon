# Encounter Combat Snapshot 修正 / Codex引継ぎ

## 原因と差分

Previewの通常 `create_raid_room_v1` は、`raid_room_combat_profiles` の街×難度別profileからHPを決め、`_raid_room_launch_enemy_snapshot_v1` で5体の敵編成を生成し、`raid_room_combat_snapshots` へ固定する。
Encounter resolverは登録のみを呼び、この処理を欠いていた。さらに旧variantのHPを採用していたため、新宿初級が通常220,000に対し32,000,000となっていた。

`20260913142410_quest_raid_combat_snapshot.sql` はresolverだけを差し替える。

- 通常Roomと同じprofile、難度別HP、既存敵snapshot生成関数を使用。
- Boss／Room／snapshot／Encounter CREATED確定は同じtransaction。
- profile不足・生成失敗時は中間生成をrollbackし、DRAWNの同一抽選結果から再試行。
- 作成済みRoomの再送ではsnapshotを上書きしない。
- 10%、10回未遭遇後11回目保証、街、難度重み、開催上限、報酬2倍は変更なし。
- 設定値・通常Room作成関数・戦闘関数・ACL・RLSを変更しない。

本修正とは別に、出撃準備のUI側原因は親工程で修正する。Snapshot修正だけで実画面出撃PASSとしない。

## 検証済み

- PGlite `tests/db/quest-raid-combat-snapshot.test.mjs`：PASS。
  - 実敵snapshot生成関数を実行。難度別HP、5体の編成・スキル、snapshot固定、profile不足／不正時のatomic rollback、同じ抽選結果で再試行。
  - 明示対象だけの修復、修復再送で上書きなし、Battle要求があるRoomの修復拒否。
- 既存 `tests/db/quest-raid-approved.test.mjs`：PASS（10%設定／初回保証なし／11回目、2倍、二重配送拒否、通常報酬不変）。
- 上記の登録・参加条件等はfixture。Live Battle・報酬配送実画面PASSではない。
- Live DBはREAD ONLY。Migration／修復SQLとも未適用。

実行例：`PGLITE_RUNTIME=<isolated @electric-sql/pglite dist/index.js> node tests/db/quest-raid-combat-snapshot.test.mjs`

## 既存Preview Roomの修復

自動Migrationには含めない。`supabase/operations/repair_quest_raid_combat_snapshot.sql` を別運用で使用する。

READ ONLY時点の修復候補は以下2件。いずれもsnapshotなし、Battle要求0、damage log0、progress0、HP無減少・ACTIVE。適用直前に再監査する。

- `d0157985-a2d7-45bb-b887-7e377c9b4eed`
- `84c84031-1067-4aa7-b33c-4e8a346fa594`

手順：

1. 対象がPreview `sufvuqdnqohpfzkwxohq` であることを確認。
2. 個別Room UUIDを空のallowlistへ明記。空のままでは例外停止。
3. 既定のROLLBACKで検査。対象数、HP220,000、enemy5体を確認。
4. 対象限定の修復操作として実施するときのみ最終ROLLBACKをCOMMITへ変更。
5. 同Roomへ復帰し、出撃準備→Battle→救援→報酬の実画面Acceptanceを行う。

SQLはBoss行をロックし、その後に未戦闘を再確認する。snapshot既存は保持、Battle要求／Replay／damage／progress／報酬履歴のどれかが存在、または終了・HP減少がある場合は拒否する。HPやRoom期限のリセットを広く行わない。正常Room・通常Room・戦闘済みRoomは修復対象外。

## Codex受入

Migration履歴を確認し未適用の場合だけ適用。新規遭遇のBoss HPとcombat profile、snapshotの街・難度・5体が一致することを確認する。既存不正Roomを使う場合は上記個別修復が必要。新規QAで再生成する選択でもよい。

Production適用とユーザー実機確認依頼は親のRelease Gateに従う。
