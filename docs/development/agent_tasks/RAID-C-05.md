# RAID-C-05 — サーバー更新のSQL検証
TASK ID: RAID-C-05
OWNER: raid_c_phase5
PRIORITY: P1
STATUS: VALIDATED
SCOPE: tests/db/raid-room-lifecycle-* 新規 と docs/development/raid_room_phase5_validation.md。Aのmigration00252をPGliteで無改変適用。既存00250/00251のfixtureを再利用または必要最小の拡張。登録の24h、難度別上限、撃破/期限終了を除外、定員20、再送、無許可呼出し、同時実行検証可否を正確に記録。Aと契約調整し境界検証を作成。
DO NOT TOUCH: 実装SQL、画面、既存テスト、実DB、deploy
DEPENDENCIES: RAID-A/B/C/P-04 VALIDATED。仕様基準94ed7cc、24時間または撃破・開催数上限はユーザー確認済み。
ACCEPTANCE CRITERIA: 指定範囲を実装し、境界と既存機能への影響を検証する。未接続を成功扱いしない。
VALIDATION: 関連自動テストと親レビュー。実DB/Human PASSは別。
EXPECTED OUTPUT: 日本語Completion Report、変更ファイル・テスト結果・未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とraid_room_phase5_integration.mdを含むPR head
BLOCKERS: 公開生成/参加の資格・費用等は既存資料照合中。依存する公開writerは今回範囲外。


親レビューと関連機械検証完了。根拠: raid_room_phase5_integration.md。実DB・実機・全体完了ではない。
