# RAID-A-13 — 救援報酬とPresent接続
TASK ID: RAID-A-13
OWNER: raid_a_phase13
PRIORITY: P1
STATUS: VALIDATED
SCOPE: SQL260とphase13_server文書のみ専有。救援成功本人Room1回の報酬台帳/明細/Present ID、可変品目数量設定、30日期限、自動判定を戦闘確定/CLEARへ接続、本人報酬参照RPC。既存finalizer wrapper/trigger等の選択は既存競合順序を守る。数値設定は未設定のまま、fixtureのみ仮値。契約をB/Cへ早期送付。
DO NOT TOUCH: 他担当、Battle Formula/毒、承認されていない報酬数量/主催者報酬/ranking仕様FIX、実DB/Deploy/運用有効化。Gitは親のみ。
DEPENDENCIES: 079965521caed224f664d11be51e12b92b1a0a61、第12工程VALIDATED、spec追加確定。
ACCEPTANCE CRITERIA: 救援AND成功本人Room1回、終了前開始の後確定も対象、Present自動送付30日。未設定で付与せず、再送二重付与なし。運用false維持。
VALIDATION: 実SQL/付与/再送/受取と表示、全体型/build。実DB/実機と区別。
EXPECTED OUTPUT: 日本語Completion Report、変更パス/検証/限界。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親がPR headへ統合
BLOCKERS: 品目数量の投入・通常参加/主催者報酬・ランキング切替は別途。

PARENT REVIEW: 2026-09-08、凍結実装を親レビュー・再検証済み。SQL9/共通79/React24/useBattle17・全体型/Mock build PASS。詳細raid_room_phase13_integration.md。実DB/実機/運用有効化は未実施。
