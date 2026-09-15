TASK ID: RAID-FIXES-LIVE-A
OWNER: raid_top_a
PRIORITY: P1
STATUS: VALIDATED_BY_PARENT
SCOPE: 専用QA normalで不足表示と新規出撃/Result/同Replay再読込/ack/帰還。新固定URL通知までは準備だけ。既存403userの非付与確認。
DO NOT TOUCH: Production/shared alias/旧SQL再投入/自然失効Room変更/他QAのHP/master/運用フラグ。共有sourceは親のみ。
DEPENDENCIES: b7e523b7c4651a8682f5e182733604e5e463316d
ACCEPTANCE CRITERIA: 実HTTPとMock区別、token秘密非保存、結果不明は照合後判断。
VALIDATION: 新機能に影響する実導線だけ。
EXPECTED OUTPUT: scripts/raid-fixes-live/a-*、outputs/raid-fixes-live、担当報告。
BRANCH: codex/raid-fixes-preview-live-20260909
COMMIT: 親のみ
BLOCKERS: scope変更/不明は親へ

HANDOFF: 子担当は使用量上限で停止、親が引継ぎ。raid_fixes_preview_execution.md 参照。
