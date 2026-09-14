# PvP Battle Reward 実装・受入記録

基準: 890c987。Productionは未変更。既存Quest/Raidの未完了項目を維持。

## 実装

- 正式戦WIN200 CASH＋RAID_POINT_TICKET1、LOSE50 CASH。
- 旧毎戦EXP・3戦指南書/CASHを置換。Ranking/Quest/Raid/Missionや既存受給履歴の変更なし。
- pvp_match_rewards_masterにraid_ticket_rewardを追加。TOPとServer grantが同じマスターを読む。
- 既存Replay FOR UPDATE・FINALIZED早期return・PVP_BATTLE:ReplayID ledgerを再利用。既存ledgerのJST日は確定日のまま固定。
- finalizeは実ledgerのreward_items/rewards.cashを返す。Client指定reward_items/cashを上書き。
- Resultのチケット先頭表示、強調、任意の「レイドに挑戦」を接続。通常戻る/初回Ranking導線を維持。
- 古いcanonical_pvp_production_master（2026-08-22）のpayloadは旧報酬値を含むが、この付与/表示経路では参照しない。現行ローカルcanonical2026-08-30の報酬記載は更新。

## Preview適用済み・再適用禁止

Repository: `20260914223252_pvp_battle_raid_ticket_rewards.sql`

実Preview version: `20260914223627` / `pvp_battle_raid_ticket_rewards`

Target: `sufvuqdnqohpfzkwxohq`。今回の追加1件のみ。既存Quest/Raid3件は再適用していない。

## 検証

- `tests/db/pvp_battle_raid_ticket_rewards_preview_rollback.sql`：適用前transactionと適用後の両方でPASS。
- 実start RPC→fixture勝敗finalize：3勝＋1敗650 CASH/チケット3、5回startでBP5→0、RATE・Daily/Season勝利数+3、retry同一receipt、旧Replayの非遡及、素材/3戦Bonus/Presentの追加なし。
- 既存use_action_resource_ticketでチケット1消費・Raid Point0→1。
- Item付与故障注入でCASH・rank・ledger・finalizeの全体rollback。authenticated/anonからfinalize実行不可。
- 並列送信した確定済みReplay retryで同一receipt・CASH不変。ただしDB上の処理重複は未証明。初回finalize同士の同時競合は実測しておらず、行ロック・一意制約で保護。
- 実TOP/ResultコンポーネントのSSR検証PASS。同期前の報酬捏造なし、対戦相手より前に報酬、WINチケット強調・任意CTA、LOSE/旧receiptに新チケットCTAなし。子画像・音声はmock。
- SQL試験変更は全ROLLBACK。実戦E2E・ブラウザ/実機表示とは区別する。

## 残る受入

固定Preview上の実戦・画面確認、任意CTAの実画面遷移、初回finalizeの同時競合実測。
配信情報は親スレッド最終報告を参照。Vercel対象チームの参照権限403が継続する場合、GitHub status成功だけで固定URL/READY/接続先確認済みとはしない。

### 追加の検証結果

- 最終typecheck・TOP/Result SSR PASS。
- 既存verify_pvp_raid_production.mjsのPvP報酬期待値を新仕様へ更新。PvP/数値部分は通過したが、後段の旧Raid文言 `Guild Contribution` の検査でFAIL。今回対象外の表示を戻して検査を通す変更はしていない。
- ローカルwebpack build PASS（NEXT_PUBLIC_USE_MOCK_DB=true）。実接続・実機の代替ではない。

### 残件対応の追記

- 初回finalize2本を並列送信。両方200 CASH/チケット1の同一receiptだが、DB実行区間は23:14:58–23:15:00と23:15:02–23:15:04で重ならなかった。同時競合PASSとは扱わない。直接の独立DB接続で再検証が必要。
- 専用QA user/replay/ledger/feed/projection/defense logを削除し残存なしを確認。auth userは作成していない。
- 既存verify_pvp_raid_production.mjsの旧Guild Contribution検査を現行RaidRoomConnectedBrowser接続検査へ更新しPASS。UIの旧文言復元は不要だった。
