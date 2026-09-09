# RAID-C-17
TASK ID: RAID-C-17
OWNER: C
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 親が作るscripts/raid-room/build-preview-config.mjsの限定Nodeテスト tests/raid-room/preview-config.test.mjsと検証記録だけ担当。設定null/4難度/整数/重複/安全なSQL文字列/production拒否/flags不変更を確認。親実装を変更しない。
DO NOT TOUCH: 製品src/migration/実DB/Deploy/他担当/運用flags/未承認数値。
DEPENDENCIES: 45dcaba09ac0872c976b5fdcbf773beb096813f2。作業root /workspace/scratch/3f215bc02a8a/raid-prepare は固定SHAの限定復元（full checkoutではない）。
ACCEPTANCE CRITERIA: 設定と切替準備を再現可能にする。環境接続・実機受入を完了としない。
VALIDATION: 文書のsource照合/オフラインNodeテスト。親レビュー。
EXPECTED OUTPUT: Protocol Completion Report。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 親統合
BLOCKERS: 実機用数値と独立Preview DB/配信環境の確認。


PARENT REVIEW: 2026-09-08。準備範囲レビュー完了、Node11 PASS。Aは文書照合、製品停止実装ではない。SQL実行/実DB/実機未検証。詳細raid_room_phase17_integration.md。
