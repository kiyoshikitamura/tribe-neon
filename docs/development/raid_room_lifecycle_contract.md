# Raid Room登録・参加台帳の内部契約

対象: RAID-A-05 / migration `20260908000252_raid_room_lifecycle.sql`。
仕様根拠: `specs/raid_room_rescue_v1.md`（94ed7cc）。開始から24時間または撃破、難度別同時開催数10/10/10/5、参加定員20を扱う。

## 対象範囲

将来の認証済みwriterから呼ぶ非公開の台帳更新部品。Instance生成、公開参加API、戦闘開始、報酬付与、既存Instanceの変更は行わない。ここでの登録成功はプレイヤーの生成資格・参加資格を認める判定ではない。

|関数|入力|返却|
|---|---|---|
|`_raid_room_register_v1`|`p_instance_id uuid, p_owner_user_id uuid, p_difficulty_id text`|`{roomId,status:registered/already_registered}`|
|`_raid_room_add_member_v1`|`p_room_id uuid, p_user_id uuid`|`{roomId,userId,status:joined/already_joined}`|

両関数はVOLATILE、SECURITY INVOKER、固定search_path `pg_catalog`。PUBLIC/anon/authenticated/service_roleにEXECUTEを付与しない。Room・参加台帳・新ルール表の同ロール直接権限も除去し、default-deny RLSを維持する。DB所有者等の信頼済み実行文脈に限定する。

## 設定と開催数

新規 `raid_room_lifecycle_rules` に難度ごとの `max_active_rooms`、`member_capacity`、`duration_hours` を保持する。seedは10/10/10/5、20、24。再適用では既存設定を上書きしない。既存総合力・救援条件設定表を変更しない。

開催数は登録済みRoomを難度ごとに集計する。InstanceがACTIVE、HP>0、期限が現在より後、結果未確定のすべてを満たすRoomが対象。撃破済み、期限終了、結果確定済みは含めない。未登録の旧Global Instanceは自動割当・集計しない。

開始Authorityは `raid_bosses.spawned_at`。既存migration `20260822000184_pvp_raid_ranking_production.sql` の生成INSERTで使用している列を参照する。新規登録時は有限の開始時刻が現在以前、期限が開始時刻+設定時間（seed24時間）と厳密一致する必要がある。Room.created_atも同じ開始時刻を保存し、後からRoomを登録して開催期限を延長しない。

## 登録と再送

登録先Instanceを明示指定し、ACTIVE・HP>0・期限内・結果未確定、HP=max HP、progress行とDamageログがともに存在しないことを検証する。満員の難度には登録しない。Roomと所有者の参加台帳を同一トランザクションで追加する。所有者IDの実在は既存FKで検証する。

同一Instance・所有者・難度の再送は既存roomIdを返し、登録済み行・時刻を変更しない。所有者または難度を変えた再送は拒否する。既に終了したRoomでも同一登録の再送は `already_registered` を返すが、再開を意味しない。

## 参加と定員

所有者、参加台帳、確定戦数>0のprogressのUNIONで重複を除いて人数を数える。これは既存参照RPCの参加者集合と一致する。所有者を含め20人に達していれば新しい人は追加しない。既にprogress上で数えられる参加者の台帳追加は人数を増やさないため許可する。

既存所有者・台帳参加者の再送は `already_joined` を返し、時刻・人数を変更しない。終了後の再送も登録済み事実の返却だけで、戦闘許可を意味しない。未登録の参加者にはACTIVE・HP>0・期限内・結果未確定を要求する。

## 競合と例外

登録は難度ルール行→Instance行の順にFOR UPDATEし、難度の残枠確認と登録を直列化する。参加はInstance行→Room行の順にFOR UPDATEし、参加の残枠確認と追加を直列化する。既存戦闘確定も同じInstance行をロックするため、終了と参加の判定はロック取得後の状態で行う。ロック後に `clock_timestamp()` を評価する。

この集計方式はREAD COMMITTEDで、ロック待機後の別SQLが最新の確定行を参照する前提。REPEATABLE READ/SERIALIZABLE等では固定snapshotによる古い件数での許可を避けるため `25001` で拒否する。将来のwriterもこのロック順・分離レベルを守り、Instanceを先にロックしてから登録関数を呼ぶ構造にしない。複数Roomを一括処理する場合は別途ロック順を設計する。

- `22023`: 入力・期間・使用済みInstance・登録競合・開催上限・定員・終了・設定欠落。
- `P0002`: Instance/Room不在。
- `25001`: READ COMMITTED以外。
- `40001`: 参照後にRoomのInstance対応が変わった場合。再試行対象。
- FK等の制約違反: 該当SQLSTATEをそのまま返す。関数内で例外を握りつぶさず、部分登録を残さない。

## 将来の公開writerで必要な接続

本人認証、生成資格・費用、総合力の正本編成と判定時点、公開範囲、救援帰属を確定根拠に基づき検証し、リソース消費・生成・台帳登録を単一トランザクションに組む。クライアントから渡された所有者IDや資格判定値を信用しない。戦闘開始時も参加と終了を検証する。

新Instanceを生成する経路と既存日次ローテーション・respawnを分離し、既存戦闘途中のInstanceを登録対象にしない。この部品のHP/progress/log検証だけでは未確定Replayの不在や生成元を証明できないため、新規生成writerが自分で生成したInstanceだけを同じトランザクションで渡すことを必須とする。既存battle/終了処理をこの段階で変更・呼出ししない。

期限切れstatusの確定、撃破結果・報酬、遅延戦闘確定の扱いは今後の接続対象。今回の参加拒否・開催数除外は結果確定や報酬発行を代行しない。マスター調整時も開催中の期限を書き換えない。ローカルSQL検証はC-05、親レビュー・統合はP-05が記録し、実DB・実機・全体完了とは区別する。
