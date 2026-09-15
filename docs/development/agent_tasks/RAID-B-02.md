# RAID-B-02
TASK ID: RAID-B-02
OWNER: raid_b_phase2
PRIORITY: P1
STATUS: VALIDATED
SCOPE: src/app/components/raid/RaidRoomBrowser.tsx、src/app/components/raid/RaidRoomBrowser.css
Aのcontroller/portを使う実React画面。4難度タブ→Room一覧→詳細→参加者/報酬ダイアログ→参加→onBattleReady。更新ボタン、未取得/空/失敗/終了を分離。既存OutlawCard/Button/CanonicalDialog使用。Global blockerは親からsetInteractionBlocking注入。未確認Guild表示は現在所属と明示、未知を未所属にしない。
DO NOT TOUCH: 指定外ファイル、DB/Migration/Edge、既存RaidTab/useRaid/GameContext、戦闘/Replay/報酬Authority、package/lock、CI、環境設定。GitHub refは親専有。
DEPENDENCIES: .agents/AGENTS.md → release_board.md → 本契約、specs/raid_room_rescue_v1.md。Aの新exportはB/Cに早期共有。旧文書の難度なし日次Raidを新仕様に戻さない。
ACCEPTANCE CRITERIA: 指定操作が注入した通信で成立。古い応答や失敗を参加許可へ変換しない。UIはspinnerのみ、タップ反応、モバイル幅、報酬ダイアログ。実API接続済みと報告しない。
VALIDATION: 対象TypeScript、node:test、React操作テスト。全体build/実DB/実機とは区別。
EXPECTED OUTPUT: 指定実ファイルとProtocol準拠Completion Report。必要な担当外変更は親へ連絡。
BRANCH: codex/raid-room-rescue-20260908（親管理）
COMMIT: 基準47b9213429a2611d8706cdc5cf28427d8b7ba07c。親が成果SHA記録。
BLOCKERS: 新Room backend未実装。今回の画面・操作経路は注入transportで検証し、既存本番Raidへ切替しない。Room生成/報酬資格等の未確認条件はspec参照。


親レビュー: 担当範囲と差分を確認。限定TypeScript・対象操作テストを確認。実API/DB・Next全体build・実機は未検証。
