# RAID-B-05 — Room期限の画面反映
TASK ID: RAID-B-05
OWNER: raid_b_phase5
PRIORITY: P1
STATUS: VALIDATED
SCOPE: src/domain/raidRoomLifecyclePresentation.ts 新規、src/app/components/raid/RaidRoomBrowser.tsx と必要なら同CSS、tests/raid-room/browser.test.tsx。期限までの残り時間を表示、24時間または撃破終了の説明、期限を過ぎた古いactive DTOで参加操作しない。cleared/expired/HP0時は適切な表示と操作抑止。取得済みサーバー状態をローカル時計で正式確定しない。unknownはunknownのまま。サーバー確定を代行しない。既存spinner/interaction blocker維持。
DO NOT TOUCH: SQL、既存共有UI、GameContext、domain controller、ほかのtests
DEPENDENCIES: RAID-A/B/C/P-04 VALIDATED。仕様基準94ed7cc、24時間または撃破・開催数上限はユーザー確認済み。
ACCEPTANCE CRITERIA: 指定範囲を実装し、境界と既存機能への影響を検証する。未接続を成功扱いしない。
VALIDATION: 関連自動テストと親レビュー。実DB/Human PASSは別。
EXPECTED OUTPUT: 日本語Completion Report、変更ファイル・テスト結果・未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とraid_room_phase5_integration.mdを含むPR head
BLOCKERS: 公開生成/参加の資格・費用等は既存資料照合中。依存する公開writerは今回範囲外。


実装記録: 専用helper、期限/残り時間表示、期限・HP0・未知状態の参加抑止、クリック直前再確認、SSR/hydration初期値統一と復帰時計更新を実装。React操作16件PASS（既存10+追加6）。QA fixture変更なし。公開writer・実DB・実機は未接続/未検証。親レビューと全体統合待ち。

親レビューと関連機械検証完了。根拠: raid_room_phase5_integration.md。実DB・実機・全体完了ではない。
