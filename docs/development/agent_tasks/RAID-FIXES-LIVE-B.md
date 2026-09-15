TASK ID: RAID-FIXES-LIVE-B
OWNER: raid_top_b
PRIORITY: P1
STATUS: PARTIAL_VALIDATED_BY_PARENT
SCOPE: 新規QA1名の実Fresh/装備DBとUI/power一致/再試行/再ログイン。親の新URLとDB適用完了前は実操作しない。QA分類で初期化後停止して親へ引渡し。
DO NOT TOUCH: Production/shared alias/旧SQL再投入/自然失効Room変更/他QAのHP/master/運用フラグ。共有sourceは親のみ。
DEPENDENCIES: b7e523b7c4651a8682f5e182733604e5e463316d
ACCEPTANCE CRITERIA: 実HTTPとMock区別、token秘密非保存、結果不明は照合後判断。
VALIDATION: 新機能に影響する実導線だけ。
EXPECTED OUTPUT: scripts/raid-fixes-live/b-*、outputs/raid-fixes-live、担当報告。
BRANCH: codex/raid-fixes-preview-live-20260909
COMMIT: 親のみ
BLOCKERS: scope変更/不明は親へ

HANDOFF: 子担当は使用量上限で停止、親が引継ぎ。raid_fixes_preview_execution.md 参照。
