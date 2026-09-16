# RAID-C-09 — Room戦闘確定・製品導線
TASK ID: RAID-C-09
OWNER: raid_c_phase9
PRIORITY: P1
STATUS: VALIDATED
SCOPE: tests/db/raid-room-finalization-*、Room確定専用tests、docs/development/raid_room_phase9_validation.md。PGlite実SQL00250〜256と既存trigger最小fixture、確定/期限/再送/権限/旧処理混入検証。A/BとAPI合意後適応。
DO NOT TOUCH: 担当外、既存Battle Formula/毒集計/マスター、実DB・Deploy・運用有効化・独断の報酬仕様FIX。Git操作は親のみ。
DEPENDENCIES: 4b331404d61dd7b181e2fc1a4f0f5f93dd23f558、第8工程VALIDATED、specs/raid_room_rescue_v1.md。
ACCEPTANCE CRITERIA: Room判別をサーバー台帳/開始receiptで検証。期限前開始の期限後確定は結果/個人貢献保存、終了HP/討伐は不変。再送で二重HP/貢献なし。旧報酬資格をRoomへ流用しない。既存非Room回帰なし。作成/開始flagfalse継続。
VALIDATION: 関連実SQL/境界/再送/権限、UI/controller、全体型/build。実DB/多接続/実機とは区別。
EXPECTED OUTPUT: 日本語Completion Report、変更ファイル、検証結果、未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約を含むPR headへ親が統合
BLOCKERS: 報酬/救援接続と実DB/実機は未完了。必要な未確定仕様は親へ連絡し、依存しない範囲を続行。

COMPLETION: PGlite実SQL16件PASS。256 SHA256 794850fa1a76d062533b938643866779e0dc5880e295c07fdacb84e0618300a9。詳細raid_room_phase9_validation.md。親レビュー待ち。
PARENT-APPROVED ADDITION: 実useBattle専用hook test/runner追加。5件PASS。短引数prepareOnly既存不具合を検出しB修正後PASS。useBattle hash d23b94fc021ea4cc70557867721283810c677e53d3497672af9abfc9139823e9。

親レビュー・機械検証完了。最終判定/範囲/限界は ../raid_room_phase9_integration.md。子自己報告は作業時点の記録として残す。
親承認追加範囲: tests/raid-room/use-battle-room.test.tsx、run-use-battle-room-tests.mjsによる実フック接続検証。
