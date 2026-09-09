# RAID-A-05 — サーバー側のRoom登録・参加台帳の内部更新処理
TASK ID: RAID-A-05
OWNER: raid_a_phase5
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 新規 migration 00252 と docs/development/raid_room_lifecycle_contract.md。難度別同時開催数10/10/10/5、24時間または撃破、定員20の整合性をDBトランザクションで実装。既存の新規ACTIVE Instanceを明示指定してRoom登録する非公開関数と、参加台帳へ登録する非公開関数。公開APIや経済条件は今回追加しない。Instanceの開始日時カラムを調べ、開始から24時間であることを検証。期限・撃破済み拒否、同一登録再送、上限直前と同時実行を考慮。参加資格・費用は将来の認証済みwriterが先に検証すべき前提を契約に明記。直接テーブル更新で迂回されない権限を維持。
DO NOT TOUCH: 新規SQL・契約以外、既存battle/報酬/ランキング、デプロイ、実DB操作、既存Instanceの書換え
DEPENDENCIES: RAID-A/B/C/P-04 VALIDATED。仕様基準94ed7cc、24時間または撃破・開催数上限はユーザー確認済み。
ACCEPTANCE CRITERIA: 指定範囲を実装し、境界と既存機能への影響を検証する。未接続を成功扱いしない。
VALIDATION: 関連自動テストと親レビュー。実DB/Human PASSは別。
EXPECTED OUTPUT: 日本語Completion Report、変更ファイル・テスト結果・未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とraid_room_phase5_integration.mdを含むPR head
BLOCKERS: 公開生成/参加の資格・費用等は既存資料照合中。依存する公開writerは今回範囲外。


親レビューと関連機械検証完了。根拠: raid_room_phase5_integration.md。実DB・実機・全体完了ではない。
