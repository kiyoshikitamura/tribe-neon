# RAID-C-04
TASK ID: RAID-C-04
OWNER: raid_c_phase4
STATUS: VALIDATED
SCOPE: tests/db/raid-room-condition-rules*、docs/development/raid_room_phase4_validation.md。
A-04の契約を読み、新00251のローカルPGlite検証runner/fixture/testを追加する。実Migrationを無改変実行、4難度power閾値直前/一致/直後、初級null、unknown/負数、既存TS評価との整合、救援AND各条件/一致/不足/未設定/不正、権限全拒否、readonly、再適用時設定保持を検証。救援テストの数値はローカルfixture専用、仕様seedではない。依存PGliteは既存scratch runtimeを使いpackage変更なし。AへのAPI問い合わせは直接連絡可。親に件数・limitsを報告。
PRIORITY: P1
DO NOT TOUCH: 既存Migration、戦闘/Replay/報酬/認証Authority、既存UI/DTO、package/lock、外部DB、Deploy。commit/pushは親のみ。
DEPENDENCIES: .agents/AGENTS.md → release_board.md → 本契約、codex_parallel_protocol.md、specs/raid_room_rescue_v1.md。
ACCEPTANCE CRITERIA: 総合力条件と参加許可、救援成功条件と報酬権利を分離する。未確認値を推測せず未設定として保持。公開RPCへクライアント算出power/Damageを渡して権利を得る経路を作らない。
VALIDATION: ローカルPGliteでMigration本体実行、境界/不正/未設定/権限を検証。実環境適用と区別。
EXPECTED OUTPUT: 指定範囲の差分とProtocol準拠Completion Report。親レビュー前はIMPLEMENTED。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準5f6da8b8cbf524bc1839de5e1828fa8ba39fae07
BLOCKERS: Room生成上限の単位/費用/期限、判定対象編成/時点は未確認。生成・参加・報酬writerは今回対象外。

親レビュー・機械検証済み。根拠: raid_room_phase4_integration.md。Human PASS・新Raid全体完了ではない。
