# RAID-P-04
TASK ID: RAID-P-04
OWNER: このチャット（親）
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 第4工程のTask Contract、Release Board、raid_room_phase4_integration.md、親レビュー・統合検証・PR更新、既存PreviewのHTTP/ブラウザ操作確認。
DO NOT TOUCH: Production/Preview DB、Deploy、既存戦闘・認証・報酬Authority、未確認構造条件の独断FIX。
DEPENDENCIES: A-04/C-04、codex_parallel_protocol.md、specs/raid_room_rescue_v1.md。
ACCEPTANCE CRITERIA: 変更範囲と権限を親レビューし、条件判定と実際の参加/報酬権利を区別。検証結果と残る入力を具体的に記録。
VALIDATION: 既存共通テスト、新SQLテスト、必要な型検証。無変更UIの全体build/実機を今回の新規検証としない。
EXPECTED OUTPUT: 親レビュー結果を同一差分のPR headへ保存。完了通知の根拠になるVALIDATED記録。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準5f6da8b8cbf524bc1839de5e1828fa8ba39fae07
BLOCKERS: Room生成の上限単位/費用/期限/再生成、対象編成/判定時点の新仕様根拠未確認。依存するwriterは着手しない。

親レビュー・機械検証済み。根拠: raid_room_phase4_integration.md。Human PASS・新Raid全体完了ではない。
