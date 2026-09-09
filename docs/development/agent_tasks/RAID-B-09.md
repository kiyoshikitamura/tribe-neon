# RAID-B-09 — Room戦闘確定・製品導線
TASK ID: RAID-B-09
OWNER: raid_b_phase9
PRIORITY: P1
STATUS: VALIDATED
SCOPE: src/hooks/useBattle.ts、src/hooks/battle/、src/app/context/GameContext.tsx、src/app/components/RaidTab.tsx、Room関連component/domain、専用UI接続テストと契約文書。排他的製品導線担当。RoomのBriefing→準備→専用開始→既存Replay表示。再送同request、resolve失敗で開始し直さない。既存非Room維持。
DO NOT TOUCH: 担当外、既存Battle Formula/毒集計/マスター、実DB・Deploy・運用有効化・独断の報酬仕様FIX。Git操作は親のみ。
DEPENDENCIES: 4b331404d61dd7b181e2fc1a4f0f5f93dd23f558、第8工程VALIDATED、specs/raid_room_rescue_v1.md。
ACCEPTANCE CRITERIA: Room判別をサーバー台帳/開始receiptで検証。期限前開始の期限後確定は結果/個人貢献保存、終了HP/討伐は不変。再送で二重HP/貢献なし。旧報酬資格をRoomへ流用しない。既存非Room回帰なし。作成/開始flagfalse継続。
VALIDATION: 関連実SQL/境界/再送/権限、UI/controller、全体型/build。実DB/多接続/実機とは区別。
EXPECTED OUTPUT: 日本語Completion Report、変更ファイル、検証結果、未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約を含むPR headへ親が統合
BLOCKERS: 報酬/救援接続と実DB/実機は未完了。必要な未確定仕様は親へ連絡し、依存しない範囲を続行。

RESULT: 専用attemptテスト7件PASS、全体Mock build/typecheck PASS。詳細 ../raid_room_phase9_ui_connection.md。親レビュー待ち。

親レビュー・機械検証完了。最終判定/範囲/限界は ../raid_room_phase9_integration.md。子自己報告は作業時点の記録として残す。
