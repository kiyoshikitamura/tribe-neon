# RAID-A-06 — 公開Room生成RPC
TASK ID: RAID-A-06
OWNER: raid_a_phase6
PRIORITY: P1
STATUS: VALIDATED
SCOPE: 新規00253 SQLとraid_room_creation_contract.md。認証本人・Lv5・既存calculate_user_total_powerを生成時サーバー再計算し00251下限判定。create_raid_room_v1(p_difficulty_id text,p_raid_variant_id text,p_request_id uuid) returns Room DTO。Room作成追加消費なし（今回ユーザー進めてくださいで了承）。既存is_production_enabledなcanonical_raid_variantsを参照、HP等は既存値の仮引継ぎでバランス承認ではない。24h新Instance+_register_v1を同一transaction、難度ロック先行。request_idはユーザー単位冪等台帳で二重生成なし・別payload再利用拒否。Room生成は公開writerとして実装するが専用有効化フラグdefault falseで、旧Raid開始/終了/報酬経路の分離が完成するまで公開運用不可（例外で拒否、何も消費しない）。既存battle/報酬/rotate関数を今は改変しない。新Instanceはraid_day_keyにRoom専用識別子を用い旧日次groupと混ぜない。7種参照用list_raid_room_boss_choices_v1()を認証付きで追加、UI用id/nameを返す。createはrequested instance所有者をclientから受取らずauth.uid。grant最小、設定はprivate。公開参加/戦闘は次工程、今回は生成まで。
DO NOT TOUCH: 00253/新契約以外、既存マスター、既存battle/報酬・DB適用・deploy
DEPENDENCIES: 第5工程VALIDATED、基準67070ed。ユーザーは作成追加費用なしの確認に進めてくださいと回答。
ACCEPTANCE CRITERIA: 指定処理と失敗・境界を実装検証。生成成功と戦闘開始成功を分ける。
VALIDATION: 関連テストと親全体型検証/build。実DB/Human PASSは別。
EXPECTED OUTPUT: 日本語Completion Reportと未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とphase6_integrationを含むPR head
BLOCKERS: 公開運用は旧開始/終了/報酬経路の分離・新戦闘接続前には有効化しない。


親レビュー・機械検証完了。根拠: raid_room_phase6_integration.md。公開運用・実DB・実機は未完了。
