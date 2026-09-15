TASK ID: RAID-STEP6-LOCAL-FIX-A
OWNER: raid_top_a
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 参加条件拒否の具体表示。担当: src/app/components/raid/RaidRoomBrowser.tsx と関連raid UI/純粋error helper/専用test。GameContext/useBattle/SQLは触らない。
DO NOT TOUCH: 外部DB/Deploy/Production/alias/Cron/フラグ/他担当ファイル/過去証跡。親のみ共通ファイル編集・commit。
DEPENDENCIES: 648a513038284cfbcb65d3cf3a74ce02872cc9c4
ACCEPTANCE CRITERIA: 最新ユーザー要求、判定/戦闘/報酬仕様不変、未知値の推測なし。
VALIDATION: 影響する回帰・型・必要なローカル画面。既存PASS転記しない。
EXPECTED OUTPUT: 担当差分、docs/development/raid_step6_local_fix_a.md
BRANCH: codex/raid-step6-local-fixes-20260909
COMMIT: 親のみ
BLOCKERS: 共有ファイル/仕様不明は親へ報告。
