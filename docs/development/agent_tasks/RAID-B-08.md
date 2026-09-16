# RAID-B-08 — 公開参加と戦闘開始準備
TASK ID: RAID-B-08
OWNER: raid_b_phase8
PRIORITY: P1
STATUS: VALIDATED
SCOPE: Room専用client/transport/画面とQA fixture・関連React/Nodeテスト。既存joinRoom→Replay契約を維持し、optional registerParticipationとgetBriefingを追加。参加登録でReplayを捏造せず登録後詳細/briefing表示へ。実戦闘接続が未提供なら戦闘開始成功と表示しない。A契約のRPCにopt-inで接続、旧get_active_raids非使用。GameContext/useBattle/共有UIは変更禁止。次工程の親接続のためbriefingDTOと明示callback設計。
DO NOT TOUCH: 担当外、既存マスター、実DB適用、Deploy、運用有効化、独断仕様FIX。Git操作は親のみ。
DEPENDENCIES: b9a59714ac90ef4ef5e6304bf5e683f4a7c7e285、第7工程VALIDATED、今回3条件承認。
ACCEPTANCE CRITERIA: 参照/参加と戦闘開始のAuthority分離。旧非Roomを維持し再送二重消費なし。確定/報酬未接続を成功扱いしない。
VALIDATION: 実SQLと関連domain/Reactテスト、親レビュー/全体build。実機とは別。
EXPECTED OUTPUT: 日本語Completion Reportと未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とphase8 integrationを含むPR head
BLOCKERS: 新Room確定と旧日次trigger集計分離前は開始設定falseを維持。救援/報酬は未実装。


## Completion Report
- optional registerParticipation/getBriefingとenableParticipation opt-inを追加。register receiptをReplayへ変換しない。従来combined join契約は旧transportで維持。
- 公開詳細ではbriefing先行、参加済みの場合のみ参加者API取得。未参加の参加者一覧操作は無効。参加条件はサーバーbriefingから表示/抑止。
- 参加登録は連打抑止、失敗時資格破棄・更新後再送、選択変更後の古い応答破棄。救援ID付き登録は未接続を明示し拒否。
- 作成・登録後に詳細/briefing/参加者更新。QAサンプルも参加台帳に反映し、戦闘Replayは捏造しない。
- briefingの運用flagがtrue、参加済み、かつ親onBriefingReady callbackがある場合のみ出撃準備導線。運用flagは実編成資格とは区別。
- 子検証: Node52件、React20件、全体tsc --noEmit PASS。親レビュー・全体buildは親判定。
- 未完了: 実戦闘画面への親接続、開始/確定/報酬、実DB、実機。開始成功や全体完成ではない。

親レビュー・機械検証完了。根拠raid_room_phase8_integration.md。実DB・実機・新Room確定/報酬は未完了。
