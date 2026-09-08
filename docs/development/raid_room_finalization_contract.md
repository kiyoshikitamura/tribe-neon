# Raid Room 第9工程 確定API契約

基準: 第8工程 `4b331404d61dd7b181e2fc1a4f0f5f93dd23f558`。作成/開始フラグはfalseを維持。本書は実装契約で、実DB適用・報酬仕様の確定ではない。

## サーバーAuthority

`get_raid_battle_route_v1(p_replay_id uuid)` はservice_role専用、text `ROOM` / `LEGACY` を返す。保存ReplayのRAID_SERVER、Room台帳のInstance、開始receiptの本人/Room/Replay/tactic/応答ID、保存contextのRoomId/versionを照合。不整合時はエラー。ユーザー入力はReplay IDのみで、Room指定の有無では分岐しない。

Edge `resolve-battle` は保存済み結果の早期応答より前にこのRPCを呼ぶ。Roomなら既存engine出力を `finalize_raid_room_battle_v1(p_replay_id uuid,p_result jsonb)` へ渡す。非Roomは旧finalizerを維持。DB256適用後に対応Edgeを反映する必要がある（実反映は本工程対象外）。

## Room戦闘確定

service_role専用。Replayをロックし、台帳/receipt確認後にFINALIZED再送なら保存済み結果を返す。PENDINGを既存 `validate_official_battle_result` で検証し、共有Boss行ロック後の時刻で適用可否を一度決める。

- 正規開始時刻が期限前であることを保存contextで再確認する。
- ACTIVE、HP残存、期限前、終了未確定なら rawから残HPまでをappliedにする。HP0への更新と同時にCLEARED/DEFEAT_SUCCESS/終了時刻を保存する。
- 期限後・既討伐・既終了ならrawと個人貢献を保存しappliedは0。終了HPと既存討伐結果は変更しない。
- 期限後でまだACTIVEならTIMEOUT_FAILURE/EXPIREDを確定する。HPは減らさない。
- `raid_damage_logs`、`raid_instance_user_progress`、`battle_replay_events`、Replay result/finalization_resultを同一トランザクションで保存。raw/appliedと毒の扱いは既存engineのまま。
- 旧Mission更新・報酬付与・respawnを呼ばない。

返却JSONは既存battle resultへ `roomId`, `roomOutcome`, `lateFinalization`, `rawDamage`, `appliedDamage`, `remainingBossHp`, `personalContribution`, `participationProgress` 等を付加。`roomOutcome` はDB値の `DEFEAT_SUCCESS` / `TIMEOUT_FAILURE` / 未確定null。`lateFinalization` は期限超過だけでなく、別戦闘による先行討伐を含む共有HP不適用の印。

## 期限終了・本人結果

`finalize_expired_raid_room_v1(p_room_id uuid)` はservice_role専用。Bossロック後、未終了ACTIVEかつ期限到来のみEXPIREDへ変更し、既終了・HP・討伐を変えない。返却はroomId/state/outcome/remainingBossHp。Cron接続は未実施。既存一覧projectionは期限到来を動的にexpired表示するため、書込確定前でも参加/開始は拒否される。書込確定は本RPC、または期限後戦闘確定の時点で行う。

`get_raid_room_battle_result_v1(p_replay_id uuid)` はauthenticated本人専用。RoomAuthority照合後、FINALIZEDなら保存result、未確定ならnull。報酬の空配列で未接続を偽装せず、新報酬取得は本工程では接続しない。

## 旧処理との境界

- `on_canonical_daily_activity_finalized` はRoom自身を除外し、旧Raid日次戦数/RP累計からもRoomを除外する。
- `on_canonical_guild_official_battle_exp` はRoomを旧RaidEXP資格へ流用しない。
- `capture_daily_ranking_participation` はRoomを旧日次ランキング参加台帳へ入れない。
- 非Roomの各処理本体、PvPは維持。第7工程254で失われた229の `advance_ranking_season` hookを旧finalizerに復元する。Boss/Room拒否後、Result検証前に実行し、新Roomは呼ばない。
- 147/148の初回戦闘Funnel計測triggerは維持。新報酬は発行しない。
- 既存Damageログを読むランキング集計・Guild表示等の全読者切替は後続。新Roomを本番有効化する前に集計対象を決める必要がある。

## 検証範囲

C担当のPGlite実SQL/fixtureと親統合検証を別途記録する。多接続競合、実Auth・実DB、配置済みEdge、実機、旧新ランキング切替、救援・Presentは未完了。

A自己検証: 最終SQL SHA256 `794850fa1a76d062533b938643866779e0dc5880e295c07fdacb84e0618300a9`、PGlite16件PASS。Edge本体から使うroute選択helperの実行4件PASS（Room/Legacy/不正応答/通信エラー）。Deno handler全体・HTTP認証・実配置Edgeの実行確認ではない。
