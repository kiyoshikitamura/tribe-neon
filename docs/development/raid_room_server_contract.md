# Raid Room 第3工程 サーバー参照契約

対象: RAID-A-03 / Migration `20260908000250_raid_room_read_projection.sql`。
本書は参照処理の実装契約。Room公開・生成条件を最終仕様として確定するものではない。

## 台帳と正本

`raid_rooms` は既存 `raid_bosses.id` への1対1対応表。`id`、`raid_boss_instance_id`（unique FK）、`owner_user_id`（users FK）、4値の `difficulty_id`、`created_at` を保持する。
HP・期限・終了時刻・状態は既存Instanceが正本。新Roomへの既存Instance自動割当、ユーザー生成API、seed投入は実装しない。Migration直後は空であり、一覧が空でも接続エラーとは異なる。

参照許可は初期準備段階の限定範囲: 認証済みのOwner、登録済み `raid_room_members`、または対応Instanceの `raid_instance_user_progress.finalized_battles > 0` の本人。救援・公開先の最終仕様に応じ後続工程で拡張する。`raid_room_members(room_id,user_id,joined_at)` は参加記録の正本として準備するが、今回writerは公開しない。後続参加処理でmembershipと戦闘開始を同一トランザクションに記録する。
`auth.uid()` によるゲームユーザー認証を使用し、未ログインの `anon` DBロールにRPC実行権を与えない。匿名Authアカウントからのゲーム利用を新たに禁止する意味ではない。

## RPC

|RPC|引数|返却JSON|
|---|---|---|
|`list_raid_rooms_v1`|`p_difficulty_id: text = null`, `p_limit: integer = 20`, `p_offset: integer = 0`|`{ rooms: RaidRoomDto[], nextOffset: number \| null }`|
|`get_raid_room_v1`|`p_room_id: uuid`|`RaidRoomDto`|
|`get_raid_room_participants_v1`|`p_room_id: uuid`, `p_limit: integer = 20`, `p_offset: integer = 0`|`{ participants: RaidParticipantDto[], nextOffset: number \| null }`|

型定義は `src/domain/raidRoom.ts`。UTC指定を含むISO時刻はPostgreSQLのtimestamptz→JSON変換で返す。JSON数値はクライアント側でも有限・非負・安全整数を検証する。
`p_limit` は1〜100、`p_offset` は0〜1000000。null、範囲外、未知難度は `22023`。認証がない実行は `42501`。Roomの不存在と閲覧不可はともに `P0002 / room unavailable`。
一覧は `created_at DESC, id ASC`、参加者は `user_id ASC`。+1行取得して `nextOffset` を決める。offset方式のため更新をまたぐ固定Snapshotは保証しない。UI更新時は先頭ページを取得し直す。

## 表示上の意味

- `serverEligibility` は常に `{status:'unknown'}`。この工程では参加Authorityを実装しない。総合力下限や推奨値から参加可能と補完しない。
- `owner` は台帳Ownerの現プロフィール。`leaderIconUrl` は未接続のためunknown。
- `state` は既存のACTIVE/CLEARED/EXPIREDを変換する。ACTIVEかつHP0は終了確定待ちのunknown、ACTIVEかつ期限超過は表示上expiredとする（HP0判定優先）。未知状態もunknown。取得時に終了処理を書き込まない。
- `createdAt` は対応表の作成日時。将来のRoom生成日時として利用する前に生成処理と契約を揃える。
- `endedAt` はInstanceの `outcome_finalized_at`。nullは終了処理がまだ記録されていないことを表す。
- `participantCount` / 参加者一覧はOwner・登録済みmembers・確定戦のある既存進捗をunionし重複排除。未確定の登録済み参加者も含む。参照用集計であり、この工程で定員制限を実装したとは扱わない。
- `finalizedBattles` は既存進捗（進捗未作成は0）、`rawDamage` / `appliedDamage` は該当Instance×Userのログ別集計。ログが存在しない場合はDamageを0とせずunknown。
- `currentGuild` は現在の `guild_members` とGuildの名称。
- `battleGuildSnapshot.guildId` は最後の確定ログ（created_at DESC, id DESC）の所属ID。**nameは該当Guildの現在名称**であり、戦闘時の名称を保存していたと解釈しない。ログなし／Guild IDの参照先欠落はunknown、ログのGuild IDがnullならavailable/null。
- rawとappliedは別々に返す。毒加算・過去再計算は行わない。

## 権限と副作用

全RPCはSTABLE / SECURITY DEFINER、固定search_path。RLS default denyのRoom/参加台帳にPUBLIC/anon/authenticatedの直接アクセス権を与えない。公開RPC3件のみauthenticatedへEXECUTEを付与し、内部helper2件はEXECUTEを公開しない。
既存のrotate/get_active_raids/finalize/start/reward/claim等を参照RPCから呼ばない。READ ONLYトランザクション内で実行できる構造。

## 後続との境界

生成、参加、戦闘開始、救援公開、報酬取得のRPCはこのMigrationにはない。実adapterは未搭載操作を明確に拒否し、サンプル成功へフォールバックしない。既存Global Raid画面・戦闘・報酬・ランキングの稼働経路は変更しない。
実DB適用、Preview接続、実機QAは別の実施証跡が必要。ローカルfixtureによるSQL検証は実環境のMigration全履歴適用を意味しない。
