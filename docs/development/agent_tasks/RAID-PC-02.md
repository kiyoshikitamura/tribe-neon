# RAID-PC-02

TASK ID: RAID-PC-02
OWNER: PC Codex
STATUS: HUMAN_REVIEW_READY
SCOPE: 375a0ad固定でRaid14本と現Previewの列・制約・関数・triggerを照合。履歴未登録8ファイルから必要依存だけを選び、適用SQL・影響・復旧・新規3ユーザー/Guild手順を記録する。
DO NOT TOUCH: 第21工程/親release_board/製品コード、本番、実DB書込、Deploy、既存19ユーザー、migration履歴repair、merge。
BASELINE: 375a0ad642a81e9db10a9379f03e5e5f77fb4562
BRANCH: codex/raid-room-pc-step2-20260908
OUTPUT: docs/development/raid_room_pc_step2.md / raid-room-step2/ / evidence/raid-room-step2-20260908/。
VALIDATION: 実Preview READ ONLY baseline9項目一致。メモリ内DDL14本/単一transaction bundle成功、133保護signature不変、snapshot追加とシステム投稿回帰PASS。
LIMITATIONS: 実DB適用・実戦闘/複数接続/Cron/Edge/UI/Present受入・fixture作成は未実行。オフライン検証では一部補助関数をstub化。
HANDOFF: 第21工程を待たず工程2の資料作成を完了。適用は後続工程。Vercel自動Previewを誘発するpushを避け、ローカルcommitを返す。

FOLLOWUP 2026-09-08: ユーザーの追加指示により、KPI側と18:17〜18:27 JSTの枠を調整し、共有Previewで単一transactionのDDL検証を実行、既定ROLLBACKで終了。postflight成功、実行前後baseline9項目・対象13テーブル・既存Cron6件は同一。COMMIT・Deploy・運用有効化・fixture作成は未実行。詳細と実行証跡は [ROLLBACK検証レポート](../raid_room_pc_rollback_validation.md)。上記DO NOT TOUCH / LIMITATIONSは初回工程2資料作成時の制約・結果。
