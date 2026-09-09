# Raid第13工程 サーバー実装

対象: `20260908000260_raid_room_rescue_rewards.sql`。実DB適用・Deploy・設定有効化なし。

## 確定条件と処理

救援成功AND条件を満たす本人へRoomごとに1回、Present Boxへ送付し、送付日時から30日を受取期限とする。RoomのCLEAR前に開始して後から確定した戦闘も条件集計へ含む。未撃破の期限終了は対象外。

`battle_replay_sessions.finalization_status` のFINALIZEDへの更新後triggerから、当該Roomの救援参加者全員を評価する。これにより、別参加者の撃破時点で既に必要貢献を満たした救援者と、撃破後の戦闘確定で到達した救援者の両方を処理する。既にFINALIZEDの再送・旧Raidは追加発行しない。

集計対象はRoomの開始receiptと紐付く公式RAID_SERVER Replay、同本人のDamageログ、救援登録後の開始/確定、期限および終了日時より前の開始に限定する。raw_damageをContributionとして扱い、毒や共有HPの計算は変更しない。

## 設定・台帳

- `raid_room_rescue_reward_rules`: 難度、enabled、reward_version。初期4難度は無効。
- `raid_room_rescue_reward_items`: 難度、item_id、quantity。初期明細なし。整数正数のみ。
- 閾値は既存`raid_room_difficulty_rules`。初期NULLを維持。
- `raid_room_rescue_rewards`: Room×本人の一意台帳。採用した閾値版、報酬版、成功判定、戦数、Damage、送付/期限日時を保存。
- `raid_room_rescue_reward_grants`: 品目/数量とPresent IDの対応。既存Presentの`source_kind=RAID_ROOM_RESCUE`、`source_key=Room UUID:item ID`でも重複を防ぐ。

無効/品目なし/閾値未設定なら付与せず、戦闘確定自体は成功させる。発行開始後の例外は握りつぶさず、戦闘確定・全対象の台帳・Presentを同一transactionでROLLBACKする。品目を1回JSONへ取得してその発行処理の全対象へ共用し、採用値は明細に保存する。設定投入だけで過去Roomを再発行するBackfillはない。

## 本人参照RPC

`get_raid_room_rescue_reward_v1(p_room_id uuid)` は認証本人の読取のみ。

返却: `{roomId,status,rescueGate,issuedAt,expiresAt,items}`。

- `issued`: 台帳送付済。受取済かは明細のPresent状態で判断する。
- `unconfigured`: 閾値/報酬設定が未設定または無効。
- `pending`: AND成功かつ設定済だが未送付。読取で発行はしない。
- `not_eligible`: 設定済でAND条件未成立。

itemsは送付済明細のみ、各`{itemId,quantity,presentId,presentStatus,claimedAt,expiresAt}`。送付後は保存した成功判定と実Present状態を返し、設定変更で権利を再計算しない。既存`claim_present`/`claim_all_presents`へ受取を委譲し、これらの関数は変更しない。

## ロック順序

既存finalizerのReplay→bossを維持する。trigger発行中に別参加者usersのFOR UPDATEを追加しない。Present.user_id FKはKEY SHAREを取得するため、bossを待つRoom writerが先に保持するusersロックをFOR NO KEY UPDATEへ狭める。同本人writer同士の直列化は維持し、IDを変更する処理はない。

明示複製した6関数はCREATE OR REPLACE化とusers行のロック強度以外を変更しない。

|関数|元Migration|
|---|---|
|create_raid_room_v1|253|
|register_raid_room_v1|255|
|cancel_raid_room_battle_request_v1|258|
|start_raid_room_battle_v1|258|
|request_raid_room_rescue_v1|259|
|join_raid_room_rescue_v1|259|

ackはstart_requestsのみをロックするため変更なし。start内の既存resource syncはboss取得後にusersを再ロックするため、共通経済関数は変更しない。boss/Room/settings/receiptの既存ロック順・強度も変更しない。

## 検証と限界

C担当の実SQL fixtureおよび親統合検証結果は`raid_room_phase13_validation.md`/integrationを参照。実DB、複数接続の同時実行、実端末のPresent受取は未検証。未承認の報酬品目・数量・閾値は投入していない。主催者/通常参加報酬・ランキング切替は別工程。
