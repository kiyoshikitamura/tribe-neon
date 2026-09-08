# RAID-B-04
TASK ID: RAID-B-04
OWNER: raid_b_phase4
PRIORITY: P1
STATUS: VALIDATED
SCOPE: src/app/components/ui/OutlawButton.tsx、src/app/components/raid/RaidRoomBrowser.tsx、tests/raid-room/browser.test.tsx。親が共有ボタンの限定修正を排他的に許可。
Preview実ブラウザの更新/参加者一覧操作で「処理中…」が表示され、.agents/AGENTS.mdの文字なしスピナー規約違反を実測。OutlawButtonのloadingLabel空文字を明示指定として尊重する限定修正（||を??にする等）とRaid側全操作ボタンの空ラベル指定・適切なaria-label維持を行う。既存他画面の既定動作は今回変えない。同期ボタンも一瞬busyになることを考慮。二重タップ防止とglobal blockerは保持する。
DO NOT TOUCH: 指定外UI/CSS、戦闘/認証/報酬、DB、package/lock、環境設定。commit/pushは親のみ。
DEPENDENCIES: .agents/AGENTS.md → release_board.md → 本契約、codex_parallel_protocol.md。元SHA5f6da8bの実ブラウザQAで発見。
ACCEPTANCE CRITERIA: Raidのbusy中は視覚上spinnerのみ、操作のアクセシブル名は保持。既存OutlawButtonの未指定既定表示は維持。連打・参加・再試行の既存テスト継続。
VALIDATION: tests/raid-room/browser.test.tsxの既存7件と必要な回帰確認。runtimeは /workspace/scratch/be0ce4e059a1/raid-typecheck-runtime。既存実行方法はphase2検証資料参照。
EXPECTED OUTPUT: 指定ファイル差分とProtocol Completion Report。親確認前IMPLEMENTED。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準5f6da8b8cbf524bc1839de5e1828fa8ba39fae07
BLOCKERS: なし。実機Human PASSとは区別。

親レビュー・機械検証済み。根拠: raid_room_phase4_integration.md。Human PASS・新Raid全体完了ではない。
