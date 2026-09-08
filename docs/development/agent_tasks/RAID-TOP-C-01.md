# RAID-TOP-C-01
TASK ID: RAID-TOP-C-01
OWNER: C
PRIORITY: P2
STATUS: VALIDATED (HUMAN_ACCEPTANCE未判定)
SCOPE: ローカルMock・回帰・画面検証。専有: src/app/qa/raid-top/, tests/raid-room/top-*, scripts/raid-top/, docs/development/raid_top_validation.md
DO NOT TOUCH: 他担当ファイル、戦闘・Replay・ack・報酬権利・マスター・DB・Edge・Cron・運用フラグ・Deploy・push・alias。報酬スクロール/プロフィール遷移は残件。
DEPENDENCIES: src/domain/raidTop.ts の表示契約。変更提案は親へ連絡。
ACCEPTANCE CRITERIA: ユーザー指定4セクション、空/未取得/エラー区別、既存素材/実マスター、救援参照保持、既存導線保持、390px表示。日次2エリア正本不足なら独自抽選せず契約/Mockで実装。
VALIDATION: 型、Mock build、対象回帰、実画面スクリーンショット・目視。Human PASSと区別。
EXPECTED OUTPUT: コードと検証結果、既知の不足。親が最終commitするため子はcommitしない。
BRANCH: codex/raid-top-polish-step1-20260909
COMMIT: 基準70cb1f28263e5b23399709d1b4b3a7d0e96283e2、最終実装SHAは親が記録。
BLOCKERS: なし。API不足は次工程として明文化し画面実装を継続。