# RAID-C-06 — 公開生成SQL検証
TASK ID: RAID-C-06
OWNER: raid_c_phase6
PRIORITY: P1
STATUS: VALIDATED
SCOPE: tests/db/raid-room-creation-* とraid_room_phase6_validation.md。AとAPI契約連携。無改変00250〜253をPGliteで実行。本人/Lv5/下限直前一致直後・未知power・無効boss・default disabledでDB変更なし・追加コストなし・request再送/不一致・生成上限・24hを検証。calculate_user_total_power等はfixture doubleなら明記。真の多接続/実DBをPASSと言わない。
DO NOT TOUCH: SQL実装、画面、既存テスト、実DB、deploy
DEPENDENCIES: 第5工程VALIDATED、基準67070ed。ユーザーは作成追加費用なしの確認に進めてくださいと回答。
ACCEPTANCE CRITERIA: 指定処理と失敗・境界を実装検証。生成成功と戦闘開始成功を分ける。
VALIDATION: 関連テストと親全体型検証/build。実DB/Human PASSは別。
EXPECTED OUTPUT: 日本語Completion Reportと未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とphase6_integrationを含むPR head
BLOCKERS: 公開運用は旧開始/終了/報酬経路の分離・新戦闘接続前には有効化しない。


親レビュー・機械検証完了。根拠: raid_room_phase6_integration.md。公開運用・実DB・実機は未完了。
