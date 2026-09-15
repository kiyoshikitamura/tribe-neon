# Raid 第13工程 — 救援報酬表示

## 実装
- `raidRoomRescueReward.ts` は `get_raid_room_rescue_reward_v1(p_room_id)` を参照する。Room ID・状態・明細・期限を検証し、不完全な発行記録を送付済みと表示しない。
- Roomの既存「報酬」ダイアログ内に専用パネルを接続。開いた時と更新操作時に取得し、閉じた後・別Roomへの古い応答を破棄する。
- `not_eligible` は条件未達、`unconfigured` は準備中、`pending` は成功・送付待ち、`issued` は送付済みとして別表示。設定が無い状態を数量0・獲得済みと解釈しない。
- 必要戦数・Damageはサーバー返却値の表示のみ。ブラウザ側で救援成功や報酬権利を算出しない。
- 送付済み明細の数量・受取状態・期限を表示。UNCLAIMEDで返却期限を経過したものは期限切れと表示する。表示時計による期限表現は補助情報で、受取可否は既存Present RPCが判定する。
- 「プレゼントBOXへ」で本人のPresent一覧を再取得し、既存contextの表示projectionを置換してからダイアログを閉じ、InboxPanelのpresentsタブへ遷移。失敗時はダイアログに留まり再試行できる。アカウント変更時の応答を捨て、通信中は全体操作blockを使用する。既存prefetch無効化だけではダミーSWR経路に入るため、再取得成功後にprefetchedをtrueにする。全体bootstrap・mission同期・新規claim処理や経済書込みは呼ばない。
- 文字なしスピナーと既存OutlawButton/CanonicalDialogを使用。運用フラグは既定falseのまま。

## 検証・限界
- B側の全体TypeScript `tsc --noEmit --pretty false` はPASS。C担当のadapter/React検証と親の全体型・build検証を統合記録へ記載する。
- 実DB/実機確認は未実施。報酬設定値を投入した完了とは扱わない。
- 主催者・通常参加者の別報酬とランキング切替は対象外。
