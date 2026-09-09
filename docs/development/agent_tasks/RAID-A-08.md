# RAID-A-08 — 公開参加と戦闘開始準備
TASK ID: RAID-A-08
OWNER: raid_a_phase8
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 新規00255 SQLとraid_room_entry_contract.md。認証済み全プレイヤーへのRoom参照、参加register_raid_room_v1(p_room_id uuid) -> {roomId,membershipStatus:joined|already_joined}。Lv5/MainFormation総合力/状態/20capをサーバー検証、参加ではRP/Replay変更なし。新get_raid_room_briefing_v1(p_room_id uuid)は表示と本人membership/参加eligibility等を提供し旧DTOserverEligibilityはunknownを維持。新start_raid_room_battle_v1(p_room_id uuid,p_character_ids text[],p_tactic text,p_request_id uuid)は生成時と別のprivate設定default false、本人の参加必須、実出撃Snapshotのstats hp+atk+def合計で下限、既存RP初回無料/1、既存210の敵構築を再利用、本人単位request receiptで再送同Replay。startとconfirm戦闘演出/報酬を分ける。Snapshot/seed/Replay/RP一体transaction。Room判別metadataをofficial_contextへ保存。旧start/finalizeを呼ばない。運用は確定経路完成までdisabled。AだけSQL変更。APIキーはB/Cに通知。
DO NOT TOUCH: 担当外、既存マスター、実DB適用、Deploy、運用有効化、独断仕様FIX。Git操作は親のみ。
DEPENDENCIES: b9a59714ac90ef4ef5e6304bf5e683f4a7c7e285、第7工程VALIDATED、今回3条件承認。
ACCEPTANCE CRITERIA: 参照/参加と戦闘開始のAuthority分離。旧非Roomを維持し再送二重消費なし。確定/報酬未接続を成功扱いしない。
VALIDATION: 実SQLと関連domain/Reactテスト、親レビュー/全体build。実機とは別。
EXPECTED OUTPUT: 日本語Completion Reportと未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とphase8 integrationを含むPR head
BLOCKERS: 新Room確定と旧日次trigger集計分離前は開始設定falseを維持。救援/報酬は未実装。

親レビュー・機械検証完了。根拠raid_room_phase8_integration.md。実DB・実機・新Room確定/報酬は未完了。
