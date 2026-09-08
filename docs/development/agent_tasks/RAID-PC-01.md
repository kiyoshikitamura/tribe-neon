# RAID-PC-01

TASK ID: RAID-PC-01
OWNER: PC Codex
PRIORITY: P1
STATUS: IN_PROGRESS
SCOPE: 既存管理接続/Previewの読み取り、PC preflight/validation/証跡の新規記録、必要差分候補と未承認設定案の整理。
DO NOT TOUCH: 第21工程のコード/既存担当契約、親release_board、本番DB/設定/配信、既存Previewの書込・Deploy・alias・Cron操作、merge。
DEPENDENCIES: PR #27 head 375a0ad642a81e9db10a9379f03e5e5f77fb4562 / raid_room_pc_execution_handoff.md。
ACCEPTANCE CRITERIA: 接続先/実配信SHA/Edge版/履歴/実定義/Cron/競合を区別して日本語記録し、未確認をPASS扱いしない。
VALIDATION: READ ONLY + timeouts + ROLLBACK。管理画面読取。設定生成既存11テストPASS。HTTP200/JS14件200。
EXPECTED OUTPUT: raid_room_pc_preflight.md / raid_room_pc_validation.md / evidence/raid-room-pc-20260908/。
BRANCH: codex/raid-room-pc-preflight-20260908
COMMIT: 本契約を含むPC専用commit（最終応答でSHA返却）。親統合なし。
BLOCKERS: 管理接続は成立。実適用には共用Preview担当・第21工程候補SHA・履歴差分互換・報酬値・テストユーザー/Guildの確定が必要。

## PC記録

2026-09-08、工程1の接続・状態照合とRepository報告を実施。Preview DBにRoom14本未反映、旧Edge v6、Room UI設定なし。KPIの別工程migrationと稼働Cronを検出。8ファイルの履歴欠落をスキーマ欠落とは扱わず候補差分に記録。対象外実装変更なし。PC自己検証は親VALIDATED/実機確認完了の代替ではない。
