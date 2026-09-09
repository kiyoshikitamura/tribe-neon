# RAID-P-18

TASK ID: RAID-P-18
OWNER: root
PRIORITY: P1
STATUS: VALIDATED
SCOPE: release_board・契約・切替手順・親統合記録、全体検証環境復元、親レビュー、PR更新。
DO NOT TOUCH: 実DB、Deploy、merge、運用設定有効化、Battle式・Replay正本・既存報酬台帳・バランス値。担当外ファイル変更禁止。
DEPENDENCIES: 基準 f65e7c460d42bd1dcbc71411a6c0a602a49de015、第17工程完了。A/B独立、Cは実装依存、Pは親統合。
ACCEPTANCE CRITERIA: A/B/C排他的範囲管理。全体型・Mock build・意味のある関連検証。機械検証だけをVALIDATEDとし実DB/実機/全体完了としない。
VALIDATION: 関連機械検証と親diffレビュー。実DB/実機未実施を明記。
EXPECTED OUTPUT: 指定コードと日本語証跡、protocolのCompletion Report。親レビュー前はIMPLEMENTED。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本文書を含む第18工程統合commit。基準 f65e7c460d42bd1dcbc71411a6c0a602a49de015
BLOCKERS: なし。Preview接続/報酬値はこの工程の対象外。


PARENT REVIEW: 2026-09-08。担当差分レビュー済み。SQL11/Activity4/切替画面3/既存Room画面28/戦闘hook17、全体型・Mock build PASS。実DB/実機未実施。詳細 raid_room_phase18_integration.md。
