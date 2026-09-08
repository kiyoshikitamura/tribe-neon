# RAID-B-12 — 救援依頼と参加帰属
TASK ID: RAID-B-12
OWNER: raid_b_phase12
PRIORITY: P1
STATUS: VALIDATED
SCOPE: src内救援domain/adapter/RoomUI、Activity/GuildChatカードとRoom遷移、必要GameContextを排他担当。既存UI部品使用。phase12_ui文書。SQL/testsは触らない。
DO NOT TOUCH: 他担当、Battle Formula/毒/マスター、報酬資格の新規FIX、実DB/Deploy/運用有効化。Gitは親のみ。
DEPENDENCIES: 8f6828fe697bfa3ab1b34b69f3818dd2fbd19f8b、第11工程VALIDATED、spec追加確定。
ACCEPTANCE CRITERIA: 作成者のみ両公開先に各最大3回、再送重複なし。新規救援参加のみ帰属、通常参加から昇格なし。戦数/Damageはサーバー算出。終了/満員/条件不足を既存規則で拒否。運用false維持。
VALIDATION: 実SQL/権限/回数/再送/帰属、adapter/操作、全体型/build。実DB/実機と区別。
EXPECTED OUTPUT: 日本語Protocol Completion Report、変更パス、検証と残件。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親がPR headへ統合
BLOCKERS: 報酬・ランキング切替は本工程外。

親レビュー・機械検証完了。範囲/限界は ../raid_room_phase12_integration.md。Human PASSではない。
