# BUG-03 Raid Mission / BUG-04 Guild Tenure 実DB監査
日付: 2026-09-14
Repository基準: 141833fcc20c89b1fdc69bcc0b9edda8c9293b5c
対象DB: Preview sufvuqdnqohpfzkwxohq
Production: NOT EXECUTED
実装修正: 不要。既適用処理の実DB検証を追加。

## BUG-03: PASS（DB検証）
既存tests/raid-room/mission-finalization.test.mjsはローカルPGliteでMission呼出しとClear gateをstub化していたため、実DBのMission定義・受領履歴との接続は別途確認した。

追加テスト: scripts/tests/raid_mission_live_preview_rollback.sql
BEGIN内で既存の正式Room replay/開始receiptをfixture複製し、実finalize関数・実Mission評価・実Clear gate・現在のDirect Reward付与を呼び、最後にROLLBACK。

| 確認 | 結果 |
|---|---|
| 正式Room finalize 50戦 | PASS。各回の実Mission累積と正式戦闘counter一致 |
| 各戦闘のretry | PASS。結果同一、counter追加なし |
| Daily Raid | PASS。1戦でMIS_D_005進捗1 |
| Raid10戦/50戦 | PASS。MIS_N_B004/B005が10/50でCLEAR |
| late finalization | PASS。期限前開始の正式戦闘を期限後確定、Mission+1、appliedDamage=0、retry+0 |
| CANCELLED | PASS。finalize拒否、Mission/ログ増加なし |
| 開始receiptなし | PASS。failed-start相当を拒否、Mission/ログ増加なし |
| 非Raid経路 | PASS。Quest/Tutorial系をRoom finalizeへ渡して拒否。実Tutorial UI走行は未実施 |
| Clear eligibility | PASS。正式Room receipt・membership・非late確定・貢献damage > thresholdを実関数で確認 |
| Clearの境界 | PASS。damage50 / threshold50は不可、threshold49は資格成立 |
| lateとClear | PASS。late1戦を追加してもClearの算入は50戦/50damageのまま |
| Clear Mission | PASS。新規資格ledger作成時のみMIS_N_B006 +1、retry+0 |
| Clear reward retry | PASS。既存Direct Reward経路を維持、資格/報酬grant件数追加なし |

Cancel検証は実DBで許可されたCANCELLED状態を使用。failed start検証は正式開始receiptが存在しないReplayを使用する。実ネットワークの開始失敗そのものは発生させていない。

テスト後、Room outcome=null/status=ACTIVE/current_hp=180000、beginner閾値0を確認。試験中のCLEARED/閾値49は残っていない。実際のゲーム戦闘として50戦を永続追加していない。

## BUG-04: 既存Day1実装維持
supabase/migrations/20260914124315_guild_tenure_day_one_projection.sqlと実DBのrefresh_normal_mission_owned_stateを照合。

- 現在membership.joined_atからJST日付差+1。
- 現在membershipなしの場合は投影せず在籍進捗停止。
- 再加入の新joined_atを参照。
- PROGRESSのみ更新し、CLEAR/CLAIMED・報酬履歴を保持。
- sync_current_missionsから投影関数を呼ぶことを確認。
- 前工程で境界検証済み。今回新たな差異・具体的回帰リスクを認めず、同じ境界テストの再実行はしない。

## 実DB関数MD5
| 関数 | MD5 |
|---|---|
| finalize_raid_room_battle_v1 | c71f5f2f69fdfc364ee3c2028b049c73 |
| _issue_raid_room_clear_rewards_v1 | 17b5756b724204db03b96098efc1eef6 |
| _raid_room_clear_reward_progress_v1 | 72b6ceb513fec4ccbb9c66215350852b |
| refresh_normal_mission_owned_state | 4b5cdcf5381b898386509d7646a28a73 |

## 確認範囲の限界
実UIは実行環境障害により未確認。今回PASSはSQL/RPC・実DBの接続検証であり、Raid画面操作やMission画面表示の実機受入PASSとは区別する。
既存本番ユーザーの過去Raid Mission進捗backfillは本作業に含まない。
