# RAID-P-20

TASK ID: RAID-P-20
OWNER: parent
PRIORITY: P1
STATUS: IN_PROGRESS
SCOPE: 契約・release_board・統合記録、必要な親承認後の追加修正、.github/workflows/quality.ymlの独立Raidブラウザ回帰job追加（既存gate維持）
DO NOT TOUCH: 担当外製品コード・DB・マスター・認証・運用設定・Deploy・merge。Git操作は親のみ。
DEPENDENCIES: 58c7f1f45d229424857dd59943eb368ff2af98ab / Phase19 VALIDATED
ACCEPTANCE CRITERIA: CI失敗を切り分け、必要な修正を検証し、Preview未到達と残件を正確に記録する。
VALIDATION: CIログとソースの対応、変更時は対象再検証。実環境合格と混同しない。
EXPECTED OUTPUT: 担当記録とProtocol準拠Completion Report
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合時に確定
BLOCKERS: 実Preview DB/設定値は未確認。本工程はCI失敗を優先。

親追加範囲: scripts/verify_kpi_tutorial_union.mjsのローカル識別子moduleを別名へ変更する通常lintエラー修正のみ（KPI計算は変更しない）。

親検証追加: tests/raid-room/activity-sync.test.tsxへStrictMode再setup後の開催反映・unmount後の応答破棄を1件追加（新lifecycleの具体的回帰確認）。
