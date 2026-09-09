# Raid Room 第8工程 参加・開始契約

2026-09-08。ユーザー承認済みの全プレイヤー一覧、参加時Main Formation / 開始時実編成総合力を実装。初級総合力制限なし、中級160000・上級200000・超級240000。Lv5解放を継続。

## 公開範囲

認証済みユーザーは全Room一覧・詳細・briefingを読める。未認証は不可。既存認証判定（auth.uidが非NULL）を維持し、プロフィール作成前の認証済みセッションも概要参照可。参加・開始はプロフィール必須。参加者一覧の戦績/Guild所属は従来owner/member/確定戦参加者のみ。テーブル直接読書き権限を追加しない。

## RPC

- `register_raid_room_v1(p_room_id uuid)` → `{roomId,membershipStatus:'joined'|'already_joined'}`。Lv・Main Formation・HP・期限・20人上限を検証。参加済み再送は登録事実を返し、再加入や戦闘許可とは扱わない。RP/資産/Replay変更なし。
- `get_raid_room_briefing_v1(p_room_id uuid)` → `{roomId,raidBossInstanceId,raidVariantId,bossName,baseId,membershipStatus:'joined'|'not_joined',joinEligibility:{status,reason,actualPower,minimumPower},battleStartEnabled}`。後3つboss参照項目はnull可。参加資格は取得時点のみで、開始時実編成資格は未判定。RP回復/消費はしない。旧Room DTO `serverEligibility` はunknown維持。
- `start_raid_room_battle_v1(p_room_id uuid,p_character_ids text[],p_tactic text,p_request_id uuid)`。別のprivate `raid_room_battle_settings.enabled=false` で出荷。新Room確定経路が完成するまで有効化しない。本人参加・現在Lv・期限/HPをロック下で確認し、既存サーバーSnapshotのHP+ATK+DEFで下限を再判定。Main Formation再計算値は開始資格に流用しない。

開始返却は `room_id,replay_session_id,player_snapshot,enemy_snapshot,cost_type,cost,remaining_raid_points,guild_id_snapshot`。既存初回無料、それ以外RP1を継続。Snapshot・seed・Replay・RP・receiptは一つのtransaction。敵5体構築は210の実装を再利用し、既存マスター/計算式変更なし。

`raid_room_battle_start_requests` の本人+requestIDで直列化。成功後同一payload再送は保存したresponseを返し、編成を再生成せず再消費しない。返却RPは開始時保存値。payload（Room/順序付きcharacter_ids/tactic）不一致は拒否。開始設定false時は再送も拒否する。未成立の失敗はreceiptを残さず全rollback。

Snapshotは要求1〜5人と数一致、ID重複なし、HP/ATK/DEFはJSON number・非負整数・int32範囲、HP正数を検証。これによりUUIDとmaster IDによる同一キャラ二重指定も返却IDで拒否。Snapshotを再構築せずそのままReplayへ保存する。

公式metadata: `roomId,raidRoomVersion,difficultyId,roomExpiresAt,startedAt,formationPower` および既存Guild/HP/cost/variant情報。判別正本はRoom台帳と開始receipt。resolution_authorityは既存`RAID_SERVER`を維持するが、旧finalizeは呼ばない。

## 未完了

新Roomの確定/共有HP更新/期限後確定/救援/報酬/実DB適用/実機確認は未実装・未検証。期限前開始の期限後確定は結果と個人貢献を保存し終了HP/討伐を変更しない承認済み仕様を次工程で実装する。既存resolve-battleは旧finalizeへ向かいRoomが拒否されるため、開始設定の運用有効化をしない。SQL単体fixtureは実Authや多接続競合の証明ではない。
