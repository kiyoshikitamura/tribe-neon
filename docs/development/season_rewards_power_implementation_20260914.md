# 正式Season 総合力報酬：実装候補と未決事項

基準SHA: `ed215459dc1b895fe94b17fd28d66c991a3ba0d6`。対象DB: Preview `sufvuqdnqohpfzkwxohq`。本報告時点で恒久Migration適用なし。Production変更なし。

## 実装した範囲

- 添付 `TRIBE_NEON_Season_Ranking_Reward_Master_20260914.md` のPOWER 5段階／GUILD_POWER 4段階をcanonical JSONとDB masterへ実装。既存11 Item IDのみ。CASH/DIAは0。
- `monthly_power_season_runs` に明示登録したSeasonだけが対象。既存Daily／PvP／Preopenを対象に追加しない。
- `snapshot_monthly_power_season_v1(uuid)` が終了後の順位・Guild終了時所属・joined_at・JST継続日数・既存KPI在籍履歴を固定。所属履歴を捏造しない。
- POWERの順位は現 `get_ranking_self_context` と同じ `dense_rank(total_power DESC, updated_at ASC)`。Guildは通常総合力の同RPCと同じ集計および `dense_rank(score DESC,guild_id)`。Preopen専用の同順位・除外方式は転用しない。
- 登録済みSeasonの終了後、総合力／所属に関わる変更前にsnapshotを取得するguardを追加。既存guard／RPC／RLSは削除しない。新規cronは未追加。
- Item付与は既存 `grant_present_payload` と `ranking_season_reward_grants` のreceipt、既存集約通知・既読APIを使用。カテゴリCHECKだけを定義一致guard付きで拡張。
- 未決事項が残るため、完全finalizer `finalize_monthly_power_season_rewards_v1(uuid)` はsnapshot後に `SNAPSHOT_READY_REWARD_BINDINGS_REQUIRED` を返す。実付与済みとは扱わない。
- 内部Item tranche `grant_monthly_power_items_v1(uuid)` はDB ownerのみ実行可能。service_roleも明示REVOKE。確定していない一部報酬だけを自動配布しない。
- UI用 `get_monthly_power_season_rewards_v1(text)` はauthenticated本人にSeason・9Tier・自分の順位・Tier別Item・資格の未確定状態を返す。Guild予定報酬は条件付きで表示すること。

## 決定・接続が必要なもの

1. 通常SeasonのCosmetic正式ID。POWER: Champion／TOP3／TOP10の称号とBadge、TOP30／TOP100 Badge。Guild: Champion Emblem・Decoration・Champion表示、TOP3 Emblem・Decoration、TOP10 Decoration・Badge、TOP20 Badge。現MasterのPvP・GvG・ショップ・Preopen限定IDはこのAuthorityではない。架空ID／代用品は未作成。
2. 「当該Season中7日以上在籍」が同Guildへの再加入前後を累積するか、終了時の継続在籍のみか。実装候補の計算関数は加入日Day1のJST継続日数をSeason開始でclipする。`eligibility_policy` はNULLのままとし、確定扱いにしない。既存履歴もsnapshotへ保持し、将来の確定方式で照合できるようにする。
3. 上記解決後の完全Cosmetic付与／終了自動実行／Season CLOSED／次Season準備の接続。現在は構造・UI・Item候補までで、自動運営完了ではない。

## 検証

Previewへ候補DDL＋`tests/db/season_rewards_power_preview_rollback.sql`を同一transactionで実行し、末尾ROLLBACK。結果: **PASS**。

- 実データからPOWER/Guild snapshotを作成し、再送不変・UPDATE拒否。
- 6日／7日のJST境界（終了はexclusive）を検証。
- Cosmetic未決時に付与なし、資格ポリシーNULL時にGuild Item付与拒否。
- 故意のuser_items書込み失敗で、それまでのItem付与・ledgerも全rollback。
- 実Item付与を両カテゴリで実行し、再送の追加件数0。
- snapshot後に実guild_members行をtransaction内で削除しても、固定済み受領対象の報酬は残る。
- Present増加0、CASH/DIA変更0。
- 内部付与APIのauthenticated/service_role EXECUTEなし。
- UI RPCのPOWER5Tier／Guild4Tier。

テスト中の資格ポリシー設定はrollback内の候補検証だけで、仕様承認でも恒久変更でもない。複数session同時実行と実時刻の自動cutoff、実UI受入は未実施。並行性の制御はSeason行lockと既存ledger主キー／ON CONFLICTで実装。

## 変更ファイル

- `src/domain/gameplay/canonical/data/season_power_rewards_20260914.json`
- `supabase/migrations/20260914143144_season_rewards_power_master_and_snapshot.sql`
- `tests/db/season_rewards_power_preview_rollback.sql`
- 本報告

Migration名はSupabase CLI `migration new season_rewards_power_master_and_snapshot`で生成。Preview適用とcommitは親エージェントが統合レビュー後に実施する。

## 親側の後続適用
親側がPreviewへ関数・Master定義のみ恒久適用済み。実versionと適用後確認はformal_open_resume_progress_20260914.md参照。本文の未適用は子担当引渡し時点の記録。Season切替・配布は未実行。
