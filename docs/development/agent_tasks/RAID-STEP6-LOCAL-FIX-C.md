TASK ID: RAID-STEP6-LOCAL-FIX-C
OWNER: raid_top_c
PRIORITY: P1
STATUS: COMPLETED
SCOPE: 初期装備候補のCharacter重複照合、局所SQL候補と初回/再試行/再ログイン検証。担当: scripts/raid-step6-local-fixes/c-* と専用報告。GameContext変更は親へ具体patch提案のみ、外部変更禁止。
DO NOT TOUCH: 外部DB/Deploy/Production/alias/Cron/フラグ/他担当ファイル/過去証跡。親のみ共通ファイル編集・commit。
DEPENDENCIES: 648a513038284cfbcb65d3cf3a74ce02872cc9c4
ACCEPTANCE CRITERIA: 最新ユーザー要求、判定/戦闘/報酬仕様不変、未知値の推測なし。
VALIDATION: 影響する回帰・型・必要なローカル画面。既存PASS転記しない。
EXPECTED OUTPUT: 担当差分、docs/development/raid_step6_local_fix_c.md
BRANCH: codex/raid-step6-local-fixes-20260909
COMMIT: 親のみ
BLOCKERS: 共有ファイル/仕様不明は親へ報告。
RESULT: 実GameContext＋正式ローカルmigration縦9群、migration単体15群PASS。外部/既存救済なし。raid_step6_local_fix_c.md参照。
