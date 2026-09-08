# RAID-A-20

TASK ID: RAID-A-20
OWNER: raid_a_phase20
PRIORITY: P1
STATUS: IN_PROGRESS
SCOPE: eslint.config.mjs の lint 対象調整（原因特定後のみ）、docs/development/raid_room_phase20_lint.md
DO NOT TOUCH: 担当外製品コード・DB・マスター・認証・運用設定・Deploy・merge。Git操作は親のみ。
DEPENDENCIES: 58c7f1f45d229424857dd59943eb368ff2af98ab / Phase19 VALIDATED
ACCEPTANCE CRITERIA: CI lint heap OOMの原因を対象ファイルで確認し、製品コードのlintを弱めず生成物を除外できる場合だけ修正。広範な既存lint修正は禁止。
VALIDATION: CIログとソースの対応、変更時は対象再検証。実環境合格と混同しない。
EXPECTED OUTPUT: 担当記録とProtocol準拠Completion Report
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合時に確定
BLOCKERS: 実Preview DB/設定値は未確認。本工程はCI失敗を優先。

## 親の追加割当

baseline b08e396は通常lint完走、現行のみOOMと判明したため修復を追加する。
SCOPE追加: src/hooks/useBattle.ts の追加Room経路の処理分割、および必要な新規専用helper（src/domain/raidRoom*またはsrc/hooks/配下）。戦闘計算/seed/Replay/料金/権限/復帰条件/公開APIは変更せず構造分割のみ。lint除外・rule off・依存更新は禁止。既存tests/raid-room/run-use-battle-room-tests.mjsの17件と通常対象lintを検証。原因や変更が指定範囲外なら親へ報告。
