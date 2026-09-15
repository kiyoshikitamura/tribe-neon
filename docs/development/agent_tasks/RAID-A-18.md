# RAID-A-18

TASK ID: RAID-A-18
OWNER: raid_a_phase17
PRIORITY: P1
STATUS: VALIDATED
SCOPE: SQL263新規migrationとraid_room_phase18_server.md。旧rotate/respawn/get_active_raids/start_raid_battleの停止guard。排他的DB担当。
DO NOT TOUCH: 実DB、Deploy、merge、運用設定有効化、Battle式・Replay正本・既存報酬台帳・バランス値。担当外ファイル変更禁止。
DEPENDENCIES: 基準 f65e7c460d42bd1dcbc71411a6c0a602a49de015、第17工程完了。A/B独立、Cは実装依存、Pは親統合。
ACCEPTANCE CRITERIA: 停止設定は既存動作維持がdefault。切替後の旧生成/新規開始なし。開始済みReplay確定・既存Present受取維持。ACL/RLSと停止設定更新との競合順序を考慮。過去migrationの改変なし。
VALIDATION: 関連機械検証と親diffレビュー。実DB/実機未実施を明記。
EXPECTED OUTPUT: 指定コードと日本語証跡、protocolのCompletion Report。親レビュー前はIMPLEMENTED。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本文書を含む第18工程統合commit。基準 f65e7c460d42bd1dcbc71411a6c0a602a49de015
BLOCKERS: なし。Preview接続/報酬値はこの工程の対象外。


PARENT REVIEW: 2026-09-08。担当差分レビュー済み。SQL11/Activity4/切替画面3/既存Room画面28/戦闘hook17、全体型・Mock build PASS。実DB/実機未実施。詳細 raid_room_phase18_integration.md。
