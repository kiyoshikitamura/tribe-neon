# 第16工程 UI — 討伐報酬

STATUS: IMPLEMENTED（親レビュー・C回帰待ち）

## 実装
- `get_raid_room_clear_reward_v1(p_room_id)` の本人結果だけを取得するadapterを追加。
- status / clearGate / 発行日時 / Present明細を検証し、資格計算と報酬発行はサーバーに従う。
- 開催中の累積貢献が設定値を「超える」こと、撃破が必要なこと、終了後確定の戦闘は討伐報酬の貢献に含まれないことを表示。
- 未設定 / 条件未達 / 送付待ち / 送付済みと、対象貢献・明細・受取状態・期限を表示。
- 既存Room報酬Dialogに討伐報酬と救援成功報酬を別見出しで配置。救援の資格・表示は変更しない。
- 既存Present取得後にBOXを開くコールバックを再利用。新たな付与/claim処理は追加しない。
- Room/Userの変更時は古い本人結果を表示せず再取得。接続側はUser×Roomで報酬パネルを再mountし、古い通信結果を反映しない。
- 通信中は文字なしspinner、操作連打を防止。失敗時は再取得/BOX再試行が可能。

## ファイル
- src/domain/raidRoomClearReward.ts
- src/app/components/raid/RaidRoomClearRewardPanel.tsx
- src/app/components/raid/RaidRoomConnectedBrowser.tsx
- docs/development/raid_room_phase16_ui.md

## 検証と限界
- 全体 `tsc --noEmit`: B初版PASS。
- Cが独立adapter/実React回帰を担当し、親が統合build/typeを実施。
- 本番の閾値・報酬品目数量を投入していない。運用設定を有効にしていない。
- 実DB/実機は未検証。SQL262の本人readを適用した接続先が必要。
