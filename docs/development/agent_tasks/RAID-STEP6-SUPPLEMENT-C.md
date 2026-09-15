TASK ID: RAID-STEP6-SUPPLEMENT-C
OWNER: C
PRIORITY: P1
STATUS: COMPLETED
SCOPE: 初期装備403の最新修正照合、未解消なら局所修正候補と隔離ローカル検証。外部書込なし。共通GameContextは親へpatch提案。
DO NOT TOUCH: Production/main/deploy/alias/Cron/flags/外部DDL/既存他RoomHP/自然失効Room。既存step6証跡は変更しない。共有ファイル編集は親のみ。
DEPENDENCIES: 配信2d2d2b1563e92f1471f9c86fa8a7cc59040ec726、証跡b8ad912782f49fb6a58eef4f12b0cea95856e4f0
ACCEPTANCE CRITERIA: 実データとMock/ローカル検証の区別、秘密値非保存、同request再送、結果不明時は新規操作せず照合
VALIDATION: 担当独立検証・親レビュー、必要な型/テスト
EXPECTED OUTPUT: scripts/raid-step6-supplement/c-*、outputs/raid-step6-supplement/c-*、docs/development/raid_step6_supplement_c.md
BRANCH: codex/raid-step6-supplement-20260909
COMMIT: 親のみ
BLOCKERS: 未確認をPASSにしない。必要なactor/局所scopeは親へ報告。

RESULT: local候補SQL15群/projection6群PASS。共有source/外部未適用、実多接続と既存Fresh救済は未確認。raid_step6_supplement_c.md参照。
