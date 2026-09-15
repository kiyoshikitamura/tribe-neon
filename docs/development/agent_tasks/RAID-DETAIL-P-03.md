# RAID-DETAIL-P-03
TASK ID: RAID-DETAIL-P-03
OWNER: P
PRIORITY: P1
STATUS: MACHINE PASS / HUMAN REVIEW REQUIRED
SCOPE: raid_detail_step3_contract.md の専有範囲。
DO NOT TOUCH: 他担当ファイル、共通プロフィール/CanonicalDialog/GameContext、戦闘計算/報酬資格/バランス/Replay/ack/日次。Preview/本番/Deploy/push/Edge/Cron/フラグ。子commitなし。
DEPENDENCIES: raid_detail_step3_contract.md, src/domain/raidRoomDisplay.ts。共有変更は親統合。
ACCEPTANCE CRITERIA: 第3工程ユーザー要件、4role/lifecycle/不明区別、プロフィール往復位置、報酬scroll/close/Present区別。
VALIDATION: 390px/短画面、実部品Mock screenshot・目視、型/build/関連回帰。追加SQLは隔離DBのみ。
EXPECTED OUTPUT: 変更、実装/検証結果、残件を規定形式で報告。
BRANCH: codex/raid-detail-step3-20260909
COMMIT: 基準4e50a455947d837df66b4ecc64f755a13b8f83ff、親が最終commit。
BLOCKERS: なし。不足は親へ連絡。
