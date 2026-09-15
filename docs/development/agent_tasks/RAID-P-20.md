# RAID-P-20

TASK ID: RAID-P-20
OWNER: parent
PRIORITY: P1
STATUS: VALIDATED
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

親追加範囲（2026-09-08）: 子 raid20_projection_check に scripts/verify_tutorial_first_home.mjs の旧RPC直接呼出しassertを、現行のRoom/旧Raid bootstrap server projectionへ追随させる修正のみ委任。その他assert維持、実ソース照合と親再実行を必須とする。

## 親完了記録（2026-09-08）

CI run34201260481の独立Raidブラウザ18件・Mock6件・build PASSを確認。head aef63eb、合成checkout ed99a954（base314b38f）。通常CI lint0errors/型PASS、広域E2E失敗は統合記録へ残す。

追加したFirst Home検証修正は親が現行bootstrap/transportソースに照合し、node scripts/verify_tutorial_first_home.mjs 全assert PASS、activity-cutover4件PASS、対象eslint PASS。既存7都市背景をheadから取得して実行し、asset assertも維持。npm集約コマンドは未展開のStarter Skill iconに停止したため集約ローカルPASSとは扱わない（変更のないparity3種は直前CIでPASS）。

本TaskのCI不整合切り分け・修正・機械検証を完了。全CI合格、実DB/実機、Release承認ではない。追加した静的検証のremote CI確認は次のpush後に追跡する。
