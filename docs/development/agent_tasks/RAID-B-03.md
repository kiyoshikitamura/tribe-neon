# RAID-B-03
TASK ID: RAID-B-03
OWNER: raid_b_phase3
PRIORITY: P1
STATUS: VALIDATED
SCOPE: src/domain/raidRoomRpcTransport.ts、src/app/components/raid/RaidRoomConnectedBrowser.tsx
Aの参照RPCを実際に呼ぶtransport adapterと既存Browser接続コンポーネントを実装。RPC clientを注入、型検証・エラーはfail closed。list/get/participantsはAと一致。報酬RPC/参加確定が未実装なため、getRewards/joinは未接続として明示的に失敗させる（空配列や架空Replayで成功しない）。既存RoomTransport interfaceを変更せず、将来のauthority接続をオプションcallbackで注入可能にする。サーバーのunknownをeligibleへ変換しない。実GameContextは既存親からpropsで注入し共有Contextを変更しない。
DO NOT TOUCH: 指定外ファイル、既存Migration/戦闘/Replay/報酬/マスター、既存RaidTab/GameContext、package/lock/CI/環境設定、Production/Preview接続。Git commit/pushは親専有。
DEPENDENCIES: .agents/AGENTS.md → release_board.md → 本契約、specs/raid_room_rescue_v1.md。他agentとのexport/RPC契約共有を早期に行う。
ACCEPTANCE CRITERIA: 担当機能がローカルで検証できる。未確認仕様を最終FIXとしない。参加/報酬未接続を偽成功にしない。
VALIDATION: 対象テストと型整合。実DB本番や全機能完成と呼ばない。
EXPECTED OUTPUT: 指定ファイルとProtocol準拠Completion Report。親レビュー後のVALIDATEDをPRへ記録し完了通知の根拠にする。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準5c441cd3eb4277fd37bcc2f739650c499965985b、親が成果記録。
BLOCKERS: Room生成制限の集計範囲/期限、救援公開範囲・帰属、報酬資格・新旧切替はspecの未確認事項。今回は参照経路まで、全体完成ではない。


親レビュー済み。検証結果はraid_room_phase3_integration.mdおよびraid_room_phase3_validation.md参照。全体新Raid完了ではない。
