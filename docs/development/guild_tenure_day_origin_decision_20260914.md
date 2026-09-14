# Guild在籍日数：確定仕様

2026-09-14 本流ユーザー承認：**Guild在籍日＝加入日を1日目**。

## 計算

現在のguild_members.joined_atをAuthorityとし、JST日付差 + 1で算出する。
ログイン日数・24時間経過数ではない。

| 例 | 表示日数 |
|---|---:|
| 9/14 23:50 JST加入、9/14中に同期 | 1 |
| 同じ所属で9/15 00:10 JSTに同期 | 2 |
| 加入日の29日後 | 30 |
| 加入日の89日後 | 90 |

## 既存契約を保持
- Mission同期経路で投影し、毎日の全ユーザー加算cronは追加しない。
- 再同期で加算しない。
- 脱退後は進捗を加算しない。再加入した未達成Missionは現在のmembership開始日から計算。
- 既存の通常Mission契約に従い、達成済みCLEAR・受取済みCLAIMEDは維持する。
- 30日Mission受取後に90日Missionが開放される既存の前提条件は維持する。
- 報酬量・加入制限・Guildデータ・所持資産は変更しない。

## 実装
既存sync_current_missions → refresh_normal_mission_owned_stateの投影経路へ接続する。
Previewのみ。Production未反映。

## Preview検証結果
- Migration: 20260914124315_guild_tenure_day_one_projection.sql
- Preview適用履歴: 20260914124608
- Day1/29/30/89/90、同日再同期、CLEAR/CLAIMED保持、90日子Mission開放、再加入起点、脱退停止、JST日跨ぎ、owner guard: PASS。
- 適用後の正式sync_current_missions経由でも再検証PASS。検証データは全ROLLBACK。
- UIは既存bootstrap同期後のcurrent_progress表示を再利用。全ユーザーへの一括更新なし。
- Production: NOT EXECUTED。
