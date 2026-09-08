# RAID-A-03
TASK ID: RAID-A-03
OWNER: raid_a_phase3
PRIORITY: P1
STATUS: VALIDATED
SCOPE: supabase/migrations/20260908000250_raid_room_read_projection.sql、docs/development/raid_room_server_contract.md
新Room台帳と認証付きREAD ONLY参照RPC（list/get/participants）を追加する。旧raid_bossesをinstance正本として参照する対応表raid_roomsを作り、ユーザー生成RPC・既存Instanceへの自動割当はまだ作らない。難度4値・owner・unique instanceの構造のみ。既存ログ/進捗を参照しraw/applied、現在Guild/最後の確定戦Guildを分離。RPC名とJSONは早期B/Cへ共有。参加Authority未実装のserverEligibilityはunknownとする。確定power下限SQL検査は別のpower-only関数として実装可能。ユーザー指定power値は信用しない。全参照関数で認証と公開範囲を明示、匿名不可、テーブル直書き不可、stable/read-only。RLSと権限を実装。ユーザー全体へのRoom公開は新仕様確認前に断定せず、初期段階はOwner/当該Instance参加者だけ参照可（暫定の公開準備状態であり最終仕様ではない）。既存生成/終了/報酬/戦闘関数を変更しない。
DO NOT TOUCH: 指定外ファイル、既存Migration/戦闘/Replay/報酬/マスター、既存RaidTab/GameContext、package/lock/CI/環境設定、Production/Preview接続。Git commit/pushは親専有。
DEPENDENCIES: .agents/AGENTS.md → release_board.md → 本契約、specs/raid_room_rescue_v1.md。他agentとのexport/RPC契約共有を早期に行う。
ACCEPTANCE CRITERIA: 担当機能がローカルで検証できる。未確認仕様を最終FIXとしない。参加/報酬未接続を偽成功にしない。
VALIDATION: 対象テストと型整合。実DB本番や全機能完成と呼ばない。
EXPECTED OUTPUT: 指定ファイルとProtocol準拠Completion Report。親レビュー後のVALIDATEDをPRへ記録し完了通知の根拠にする。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準5c441cd3eb4277fd37bcc2f739650c499965985b、親が成果記録。
BLOCKERS: Room生成制限の集計範囲/期限、救援公開範囲・帰属、報酬資格・新旧切替はspecの未確認事項。今回は参照経路まで、全体完成ではない。


親レビュー済み。検証結果はraid_room_phase3_integration.mdおよびraid_room_phase3_validation.md参照。全体新Raid完了ではない。
