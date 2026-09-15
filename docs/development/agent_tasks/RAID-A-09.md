# RAID-A-09 — Room戦闘確定・製品導線
TASK ID: RAID-A-09
OWNER: raid_a_phase9
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 新規00256 migration、Room確定契約文書、supabase/functions/resolve-battle/index.tsおよび専用Room判別helper。排他的SQL/Edge担当。Room専用finalizeと期限終了、本人結果RPC、サーバーのRoom分岐。旧日次/ギルド報酬triggerへの混入を防ぐ必要最小差分。既存確定ログ/progress/Replay構造再利用。
DO NOT TOUCH: 担当外、既存Battle Formula/毒集計/マスター、実DB・Deploy・運用有効化・独断の報酬仕様FIX。Git操作は親のみ。
DEPENDENCIES: 4b331404d61dd7b181e2fc1a4f0f5f93dd23f558、第8工程VALIDATED、specs/raid_room_rescue_v1.md。
ACCEPTANCE CRITERIA: Room判別をサーバー台帳/開始receiptで検証。期限前開始の期限後確定は結果/個人貢献保存、終了HP/討伐は不変。再送で二重HP/貢献なし。旧報酬資格をRoomへ流用しない。既存非Room回帰なし。作成/開始flagfalse継続。
VALIDATION: 関連実SQL/境界/再送/権限、UI/controller、全体型/build。実DB/多接続/実機とは区別。
EXPECTED OUTPUT: 日本語Completion Report、変更ファイル、検証結果、未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約を含むPR headへ親が統合
BLOCKERS: 報酬/救援接続と実DB/実機は未完了。必要な未確定仕様は親へ連絡し、依存しない範囲を続行。

## A Completion Report
- 00256、Room確定契約、Edge index/raid-room-route、route単体testを実装。
- 実SQL16件、Edge route helper4件PASS。親レビュー/統合待ち。
- 旧daily/Guild/ranking参加triggerのRoom除外、254で失われた旧ranking lifecycle hookを復元。
- 新報酬/救援、全ranking読者切替、期限cron、実DB/実Edge/実機は未完了。flagsfalseを維持。

親レビュー・機械検証完了。最終判定/範囲/限界は ../raid_room_phase9_integration.md。子自己報告は作業時点の記録として残す。
親承認追加範囲: 旧非Room finalizeの229ランキングlifecycle hook復元、実使用Edge route helperと専用test。
