TASK ID: RAID-STEP6-SUPPLEMENT-B
OWNER: B
PRIORITY: P1
STATUS: IN_PROGRESS
SCOPE: Guild外の専用QA認証と公開範囲/Activity参加/終了済/総合力不足。host/rescueを変更せず、外部QA actorの候補と必要操作を親へ先に報告。
DO NOT TOUCH: Production/main/deploy/alias/Cron/flags/外部DDL/既存他RoomHP/自然失効Room。既存step6証跡は変更しない。共有ファイル編集は親のみ。
DEPENDENCIES: 配信2d2d2b1563e92f1471f9c86fa8a7cc59040ec726、証跡b8ad912782f49fb6a58eef4f12b0cea95856e4f0
ACCEPTANCE CRITERIA: 実データとMock/ローカル検証の区別、秘密値非保存、同request再送、結果不明時は新規操作せず照合
VALIDATION: 担当独立検証・親レビュー、必要な型/テスト
EXPECTED OUTPUT: scripts/raid-step6-supplement/b-*、outputs/raid-step6-supplement/b-*、docs/development/raid_step6_supplement_b.md
BRANCH: codex/raid-step6-supplement-20260909
COMMIT: 親のみ
BLOCKERS: 未確認をPASSにしない。必要なactor/局所scopeは親へ報告。
