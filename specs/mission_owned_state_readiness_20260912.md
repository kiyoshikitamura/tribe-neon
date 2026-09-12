# Mission 到達条件の追加正常化候補

対象：Preview `sufvuqdnqohpfzkwxohq`。2026-09-12 READ ONLY確認。以下は適用前の結果。

## 確認結果

- `sync_current_missions()` と個別／一括claimは次段階を進捗0で生成している。
- `evaluate_mission_progress(uuid,text,integer)` は `CHAR_LEVEL_UP` を `CHARACTER_LEVEL_AT_LEAST` にも加算する。複数キャラのレベル上昇の合算になり、1体の到達値と一致しない。
- 到達条件の根拠は `user_characters.level/awakening_level`、`user_skills.plus_val`、`user_equipments.plus_val` の所有者別最大値として取得可能。

## 候補の範囲

`scripts/mission_at_least_candidate.sql`

- 上記4種のNORMAL条件だけを所有最大値で再評価する内部helperを追加。
- sync、進捗event、個別／一括claim後に再評価。次段階は実所有値から即時表示する。
- NORMALの該当4種を既存加算式から除外。DAILY・SPECIALの既存集計は変更しない。
- 新規CLEARは報酬を自動付与しない。通常の個別／一括受取を必要とする。
- CLAIMEDおよび一度正しく到達したCLEARは維持する。消費されたスキル・装備の過去到達を撤回しない。
- 4既存関数の定義md5を照合し、ドリフトがあれば適用停止する。
- 適用時点で所有最大値未満のCLEARがあれば、過去到達の可能性があるため適用停止し個別評価する。
- 旧overload、付与内容、ledger、telemetry、日付更新救済は変更しない。

## Preview 影響

既存解放済みの対象行は各57件。新たなCLEARはキャラ覚醒＋1の44件のみ。潜在報酬は CHAR_EXP_L 合計44、CASH 0。現在のCLEARで所有最大値が未達のものは0件。

これは既存行に対する差分。次段階の将来解放や未同期ユーザーの新規行を含む全報酬見積ではない。Productionには外挿しない。

再計測：`scripts/mission_owned_state_impact.sql`（READ ONLY）
適用後の確認：`tests/db/mission-owned-state.sql`（全ROLLBACK。加算誤判定抑止、sync、個別／一括受取後の次段階、CLEAR維持、CLAIMED保持）

## 累積・在籍の残件

- Battle：`battle_replay_sessions` に requester_user_id/battle_mode/resolution_authority/finalization_status/finalized_at が存在。公式FINALIZED行を重複なしに数える候補は可能。ただしPvP勝利payload・Raid旧／Room経路の公式条件および現在のmission eventとの一致確認を終えていないため、今回自動採用しない。
- Raid撃破：旧reward claims/grants と Room clear rewards が別テーブル。報酬アイテム行数を撃破参加回数に代用しない。
- 強化「回数」：`level_up_equipment` は GEAR_UPGRADE に `v_gain`（上昇レベル数）を渡している。現行の10回が操作回数か上昇段階かは要整理。所有レベルから操作回数を推測できない。
- Guild在籍：`guild_members.joined_at` は存在するが現在所属の開始時刻であり、過去所属の通算日数は証明しない。連続／通算と加算単位が未FIXのため、この2件のみ機能保留。

実機デザイン確認は全ページ統合後の一括実施。これらの機能残件をデザイン承認に混ぜない。
