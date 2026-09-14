# BUG-07 通常Gameplay報酬の直接付与 再監査
日付: 2026-09-14
基準コード: 141833fcc20c89b1fdc69bcc0b9edda8c9293b5c
対象DB: Preview sufvuqdnqohpfzkwxohq
状態: 修正候補・実DB rollback検証済み。永続適用・Preview配信・画面検証は親統合工程。
Production: NOT EXECUTED

## 発見と修正
正式PvPのfinalize本体はrewards.cash=0を返す一方、AFTER trigger on_canonical_daily_activity_finalized が
毎戦CHAR_EXP_S×1、日次3戦SKILL_MANUAL×1とCASH40をPresentへ送っていた。
先行実装報告の「PvP通常戦CASH直接付与を維持」は現行定義と一致せず訂正する。

今回triggerの既存canonical_daily_activity_claims INSERT/ON CONFLICT/FOUNDの内側を
grant_present_payloadによる直接資産付与に変更する。既存claim台帳が重複防止Authority。
同triggerの旧非Room Raid毎戦／日次／5pt報酬の配送箇所も同様に変更。
数量、閾値、JST日付、Room除外、既存claimキー、Trigger配置、権限を維持する。

新規claim reward_payload内にdelivery=INVENTORYを付ける。
finalize_pvp_battleはAFTER trigger実行後の当該source_refのclaimをreward_itemsとして結果に保存する。
既存rewardsフィールドは既存互換で保持し、新UIはreward_delivery=INVENTORY時にreward_itemsを表示する。
再送時は保存済みfinalization_resultを返す。過去Present／過去claim／過去確定Resultは移動・書換えない。

## 6経路
| 経路 | 正式入口→資産 | 台帳・Result | 今回実DB検証 |
|---|---|---|---|
| Quest | claim_patrol_rewards→_grant_gameplay_reward_v1→grant_present_payload、CASHはusers直接 | gameplay ledger＋COMPLETED/rewards_accrued、RPC items/cash | 保存済completed patrolのclone fixtureを正式claim。返却数量と即資産一致、retry拒否・追加資産0・Present増0 PASS |
| Raid | _issue_raid_room_clear_rewards_v1／rescue→直接helper | Room grantのdirect_delivery_id、get_raid_room_*_reward_v1はDIRECT・presentIdなし・expiryなし | 既存討伐済Room・正式資格維持、receiptのみ一時除去し再発行。clear/rescue各asset一致、retry0・Present増0 PASS |
| PvP | finalize_pvp_battle→AFTER daily activity trigger→直接payload | canonical_daily_activity_claims、今回reward_items/INVENTORY結果追加 | 既存official replayのpending clone×3を正式finalize。EXP3/manual1/CASH40、Result一致、retry、Present増0、asset失敗atomic rollback PASS |
| Mission | claim_mission_reward(text)→grant_mission_reward_bundle→grant_present_payload | mission_reward_delivery_ledger/items、delivery=DIRECT＋rewards | enabled NORMALのCLEAR fixtureを正式claim。bundle asset一致、retry拒否・Present増0 PASS |
| Ranking | grant_canonical_daily_ranking_reward／grant_canonical_ranking_season_reward | award/item/season ledger、通知 | 実masterを用いるservice grant入口でDailyとSeasonの資産一致・retry0・Present増0 PASS。season close/cron自体は実行していない |
| Login Bonus | process_login_bonus→直接helper | login row＋gameplay ledger、delivery=DIRECT | 当日未受取fixture、返却数量と資産一致、同日retry追加資産0・Present増0 PASS |

今回DBのcanonical equipment全件がgrant_present_payloadのequipment_battle_master分類に包含されることも確認（未対応0）。
CASH/DIAはusers、装備は個体生成、その他Itemはuser_itemsに配送する既存共通関数を保持。

## 検証の限界
- 上記はPreview実DBの正式入口に対するtransaction rollback試験。実機画面操作を新たに実施したものではない。
- PvPのcloneは既存server snapshot/official contextを再利用。start RPCから新規戦闘を行った試験ではない。
- Mission CLEAR・Ranking順位・Login当日状態は試験fixtureであり、その資格獲得ゲームプレイ全体の再検証ではない。
- 旧非Room Raidのtrigger配送変更はソース差分確認済み。今回の新規動的試験は現行Room経路とPvP経路。
- 旧サービス専用claim_mission_reward(uuid,text)、complete_patrol_v2、pvp_season_reset等のPresent実装は存在するが、現行クライアント正式入口ではないため変更しない。
- 旧非Room専用grant_canonical_raid_reward／grant_canonical_raid_day_clear_reward／grant_raid_rewardはPresent配送が残る。Room台帳存在時にearly-returnする既存guardとサービス専用権限を確認。現行Room報酬には使用されない。非Room経路再公開時は別途直接配送へ正常化が必要。
- Daily Mission未受取補填・運営・招待・課金・旧Presentの扱いを本修正で変更していない。
- UIはsrc/hooks/useBattle.tsのPvP結果2箇所だけ変更。親統合後のbuild確認を必要とする。

## 変更・検証ファイル
- supabase/migrations/20260914160000_gameplay_battle_activity_direct_rewards.sql
- src/hooks/useBattle.ts
- scripts/tests/bug07_pvp_direct_reward_preview_rollback.sql
- scripts/tests/bug07_gameplay_reward_entrances_preview_rollback.sql
- scripts/tests/bug07_raid_ranking_reward_preview_rollback.sql

全試験ROLLBACK後: 旧2関数MD5復元、試験trigger不存在、gameplay ledger12、daily claims18、PvP finalized18、Room clear21を確認。
既存ユーザー資産への永続変更なし。親によるapply/commit/deployは本報告とは別記録。
