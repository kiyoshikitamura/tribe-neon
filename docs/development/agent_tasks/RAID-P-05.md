# RAID-P-05 — 親統合と仕様照合
TASK ID: RAID-P-05
OWNER: parent
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 仕様の根拠照合、Task管理、親レビュー、関連テスト、PR反映。ゲームバランス研究なし。
DO NOT TOUCH: Production、経済ルールの独断確定
DEPENDENCIES: RAID-A/B/C/P-04 VALIDATED。仕様基準94ed7cc、24時間または撃破・開催数上限はユーザー確認済み。
ACCEPTANCE CRITERIA: 指定範囲を実装し、境界と既存機能への影響を検証する。未接続を成功扱いしない。
VALIDATION: 関連自動テストと親レビュー。実DB/Human PASSは別。
EXPECTED OUTPUT: 日本語Completion Report、変更ファイル・テスト結果・未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とraid_room_phase5_integration.mdを含むPR head
BLOCKERS: 公開生成/参加の資格・費用等は既存資料照合中。依存する公開writerは今回範囲外。


親レビューと関連機械検証完了。根拠: raid_room_phase5_integration.md。実DB・実機・全体完了ではない。
