# RAID-C-03
TASK ID: RAID-C-03
OWNER: raid_c_phase3
PRIORITY: P1
STATUS: VALIDATED
SCOPE: tests/raid-room/rpc-transport.test.mjs、tests/db/raid-room-read-projection*、docs/development/raid_room_phase3_validation.md
A SQLをローカルのPostgreSQL互換実行環境で実行テスト。Production/Preview接続しない。必要ならscratchへPGlite等のテスト用依存を導入して可、repo package/lock変更不可。schema依存のfixture範囲・実engineを明記。認証/RLS/Ownerと参加者/第三者非公開、Room別集計、現在所属と最後の戦闘所属、raw/applied、READ ONLY呼出しを確認。B adapterは実RPC応答形状・不正応答・未接続の報酬/参加を検証。再実行可能なrunnerを専有範囲内に残す。親が全体typecheckを実行するため重複しない。
DO NOT TOUCH: 指定外ファイル、既存Migration/戦闘/Replay/報酬/マスター、既存RaidTab/GameContext、package/lock/CI/環境設定、Production/Preview接続。Git commit/pushは親専有。
DEPENDENCIES: .agents/AGENTS.md → release_board.md → 本契約、specs/raid_room_rescue_v1.md。他agentとのexport/RPC契約共有を早期に行う。
ACCEPTANCE CRITERIA: 担当機能がローカルで検証できる。未確認仕様を最終FIXとしない。参加/報酬未接続を偽成功にしない。
VALIDATION: 対象テストと型整合。実DB本番や全機能完成と呼ばない。
EXPECTED OUTPUT: 指定ファイルとProtocol準拠Completion Report。親レビュー後のVALIDATEDをPRへ記録し完了通知の根拠にする。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準5c441cd3eb4277fd37bcc2f739650c499965985b、親が成果記録。
BLOCKERS: Room生成制限の集計範囲/期限、救援公開範囲・帰属、報酬資格・新旧切替はspecの未確認事項。今回は参照経路まで、全体完成ではない。


親レビュー済み。検証結果はraid_room_phase3_integration.mdおよびraid_room_phase3_validation.md参照。全体新Raid完了ではない。
