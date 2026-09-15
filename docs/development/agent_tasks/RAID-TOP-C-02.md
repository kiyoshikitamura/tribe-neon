# RAID-TOP-C-02
TASK ID: RAID-TOP-C-02
OWNER: C
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 検証のみ: tests/raid-room/top-data*、scripts/raid-top-data/、supabase/tests/raid-top-data*、docs/development/raid_top_step2_validation.md。隔離DB実行は親が用意した接続情報のみ。既存テストの追随は親へ提案。
DO NOT TOUCH: 他担当、バランス、戦闘/報酬/Replay/ack、既存レイド期限、Preview/本番/Edge/Cron/運用設定/alias/push/Deploy。子はcommitしない。
DEPENDENCIES: raid_top_step2_contract.md。DB migrationは親だけが編集し、B日次→A集約の順に統合。SQL案は独立オブジェクトに限定。
ACCEPTANCE CRITERIA: 第2工程ユーザー要件。失敗/空を区別、認証/救援公開範囲、日次共通正本、日跨ぎ再送、上限付き一括read。
VALIDATION: 隔離localhost PostgreSQL実SQL・同時要求・日付境界・型/build/関連回帰。Preview接続と区別。
EXPECTED OUTPUT: 完了内容・変更ファイル・検証・残件。規定Completion Report。
BRANCH: codex/raid-top-data-step2-20260909
COMMIT: 基準c397df2ef489916192109120e4303d05f2da8b0c、親が最終commit。
BLOCKERS: なし。不足は早期に親へ連絡。
