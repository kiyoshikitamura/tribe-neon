# RAID-B-18

TASK ID: RAID-B-18
OWNER: raid_b_phase18
PRIORITY: P1
STATUS: VALIDATED
SCOPE: RaidTab.tsx/GameContext.tsxと必要な専用domain helper、raid_room_phase18_ui.md。共有global stateはB専有。
DO NOT TOUCH: 実DB、Deploy、merge、運用設定有効化、Battle式・Replay正本・既存報酬台帳・バランス値。担当外ファイル変更禁止。
DEPENDENCIES: 基準 f65e7c460d42bd1dcbc71411a6c0a602a49de015、第17工程完了。A/B独立、Cは実装依存、Pは親統合。
ACCEPTANCE CRITERIA: Room UI flag trueでは旧画面/旧一覧RPCを置換。falseでは従来導線維持。Room通知/復帰/Presentを維持。useBattle戦闘式/確定は触らない。
VALIDATION: 関連機械検証と親diffレビュー。実DB/実機未実施を明記。
EXPECTED OUTPUT: 指定コードと日本語証跡、protocolのCompletion Report。親レビュー前はIMPLEMENTED。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本文書を含む第18工程統合commit。基準 f65e7c460d42bd1dcbc71411a6c0a602a49de015
BLOCKERS: なし。Preview接続/報酬値はこの工程の対象外。


PARENT REVIEW: 2026-09-08。担当差分レビュー済み。SQL11/Activity4/切替画面3/既存Room画面28/戦闘hook17、全体型・Mock build PASS。実DB/実機未実施。詳細 raid_room_phase18_integration.md。
