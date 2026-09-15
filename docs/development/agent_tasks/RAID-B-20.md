# RAID-B-20

TASK ID: RAID-B-20
OWNER: raid_b_phase20
PRIORITY: P1
STATUS: VALIDATED
SCOPE: docs/development/raid_room_phase20_e2e.md（診断）、親の追加指示による tests/e2e/raid-phase3.spec.ts / tests/e2e/ranking-phase2.spec.ts / tests/e2e/main-shell.spec.ts（Phase15ランキング廃止への追随）。製品コードは親担当。
DO NOT TOUCH: 担当外製品コード・DB・マスター・認証・運用設定・Deploy・merge。Git操作は親のみ。
DEPENDENCIES: 58c7f1f45d229424857dd59943eb368ff2af98ab / Phase19 VALIDATED
ACCEPTANCE CRITERIA: CI run34198126545 全4shardの失敗を読み、現在ソース/基準b08e396と比較。Raid変更起因と既存不整合を区別し、修正対象を親へ報告。テスト緩和禁止。
VALIDATION: CIログとソースの対応、変更時は対象再検証。実環境合格と混同しない。
EXPECTED OUTPUT: 担当記録とProtocol準拠Completion Report
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合時に確定
BLOCKERS: 実Preview DB/設定値は未確認。本工程はCI失敗を優先。

## 親の追加割当: lintのRoom関連ref更新

対象: src/app/components/RaidTab.tsx、src/app/components/raid/RaidRoomClearRewardPanel.tsx、src/app/components/raid/RaidRoomRescuePanel.tsx、src/app/context/GameContext.tsx、src/app/context/hooks/useRaidRoomActivity.ts。通常eslintでrender中ref更新6エラーを確認。アカウント切替時の古い応答抑止・初期Auth後bootstrap・通知を保持し、commit後のlayout effect等へ移す。rules無効化禁止。activity13/clear4/Room28/切替3の既存テストを検証。親が担当するE2E期待順序2ファイルには触れない。

## 親レビュー完了（2026-09-08）

対象head aef63eb424a00bd7739f6db6fdabe301b13442cc。Quality run34201260481、raid-regression job101980329709で対象ブラウザ18件PASS（49秒、retry0）。実行checkoutはPR合成ed99a9548d5a4e60d829ec74c7d61c83f58cf3d2。従前のActivity14/Clear4/Room28/切替3、型・Mock buildと合わせVALIDATED。新Room実DB・実機受入ではない。
