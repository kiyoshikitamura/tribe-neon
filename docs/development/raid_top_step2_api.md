# レイドトップ 第2工程 集約API

基準: `c397df2ef489916192109120e4303d05f2da8b0c`。正式実装は `supabase/migrations/20260908175143_raid_top_aggregate_api.sql`、日次正本・挑戦受付は `supabase/migrations/20260908175140_raid_top_daily_authority.sql`。Aの集約SQLを親が正式migrationへ排他統合した。AはDB接続・適用、運用設定変更を行っていない。

## 公開契約

`get_raid_top_v1()` は引数なし。本人は `auth.uid()` から確定し、NULLまたは `public.users` の本人不在は SQLSTATE `42501`。他人のユーザーID、日付、乱数種、Guildをクライアントから受け取らない。

返値は既存 `parseRaidTopSnapshot` の形を維持する。

| 項目 | 内容 |
| --- | --- |
| `participating` | `ready/data: RaidTopEntry[]`、最大20件 |
| `rescues` | `ready/data: RaidTopEntry[]`、最大20件、同一レイド1件 |
| `dailyTargets` | `ready/data: {dateJst, targets:[{variantId},{variantId}]}` |
| `room.owner` | 公開名、ユーザーID、現リーダー参照 |
| `ownerGuild` | 現在の `guild_members` → `guilds`、所属なしは available/null |
| `participants` | 登録参加者のユーザーID・公開名・リーダー参照、最大5人 |
| `membership` | available/owner、rescue、member、not_joined |
| `enemy` | available/value:{variantId}。variant不在はunknown |
| `rescue` | 救援一覧のみ available/value:{rescueId,source,scope,guildId}。参戦中ではunknown |

SQL内部エラーを `[]` へ変換しない。正常取得の0件だけが ready/data:[]。通信/例外は既存hookでerrorになる。取得結果に不正なマスター参照などがある場合もクライアントparserが拒否し、空として表示しない。

### リーダー画像

正本は `users.favorite_character_id`。現在のGuild公開投影（Migration203/204）もこの参照を使っている。`users.avatar_url` は任意プロフィール画像でありリーダー画像の根拠にしない。

SQLは `RaidPlayerSummary` のwire形へ `leaderCharacterId: {status:'available', value: string|null}` を追加し、旧 `leaderIconUrl` はunknownとする。B担当parserが owner/participants の両方を `CHARACTERS_MASTER` と `getCharacterTransparentImg` で解決する。未知IDはunknown、確認済みnullはavailable/null。固定人物で補填せず既存匿名fallbackへ進む。旧Mockの `leaderIconUrl` のみの形もB側が互換対応する。

## 対象の選定と人数

参戦中は主催者または `raid_room_members` に本人の登録があり、ボスが ACTIVE、HP>0、期限が日次取得完了後のサーバー時刻より未来、outcome_finalized_atがNULLのもの。日付キーの一致を求めないため、前日開始して有効期限内のレイドも表示する。開始から24時間・撃破・期限終了の既存状態を更新しない。

参戦中は created_at DESC, id DESC の20件。救援は同じ有効開催条件を通す。閲覧可能な公開だけを残した後、room_idごとに publication.created_at DESC, id DESC の先頭1件を選び、全体でも同順の20件へ絞る。最新公開が閲覧不可でも、同レイドの過去の閲覧可能公開は引き続き候補となる。

人数は主催者と `raid_room_members` のUNION件数。登録者と戦績ログ件数、オンライン人数を混同しない。顔は主催者優先、続いてuser_id順の最大5人。戦績ログだけ存在し登録がない人をトップの登録参加者へ追加しない。既存詳細側の参加者集計・参加受付・報酬算出は変更しない。

本人membershipの優先順は owner → raid_room_rescue_membersあり → raid_room_membersあり → not_joined。通常参加者を救援参加者へ昇格させず、既存救援台帳を参照するだけ。

## 救援の公開範囲

根拠は Migration259 `get_raid_room_rescue_v1`。新しい公開区分は作らない。

| DB channel / wire scope | wire source | guildId | 閲覧条件 |
| --- | --- | --- | --- |
| ACTIVITY | activity | null | 認証済みユーザー |
| GUILD | guild_chat | 公開先Guild UUID | 現在のguild_membersに本人・同じguild_idが存在 |

友達限定条件は元実装にないため追加しない。Guild脱退・移籍で旧Guild公開は返さない。主催者の現在Guildと公開先Guildは別の意味なので `ownerGuild` と `rescue.guildId` を区別する。

救援IDと公開scope/guildIdを保持して既存救援遷移へ渡す。トップの閲覧は参加資格確定ではない。実際の救援参加時には既存 `join_raid_room_rescue_v1` → `get_raid_room_rescue_v1` が再度現在Guildを確認する。トップ取得後の移籍でもこの再確認を迂回しない。

公開顔・公開名だけを追加投影し、既存の参加者詳細に含まれるダメージ、確定戦闘数、戦闘時Guild等は返さない。serverEligibilityはunknownを維持し、トップの集約読取で戦力計算や資格判定を再実装しない。

## 日次と読取コスト

日次はB担当 `private.raid_daily_targets_v1()` の同じ正本を1回呼ぶ。日次初回の遅延確定以外に書込はなく、rotate/finalize、戦闘、報酬、救援公開は呼ばない。日次関数は書込可能なので集約RPCはvolatileとする。日次の抽選・日跨ぎ冪等性・挑戦受付の条件は日次正式migrationを参照する。

先に各一覧20件を選び、最大40レイドの和集合だけをプロフィール・所属・登録参加者へjoinする。プロフィール読取は各レイド主催者＋顔5人の集合で重複排除。CTEの集合演算で処理し、レイドごとのプロフィールRPCや戦況RPC、PL/pgSQLループを使用しない。全ページ取得も行わない。

既存indexはraid_room_members(user_id,room_id)、raid_room_members(room_id,user_id)、raid_rooms(owner_user_id,created_at,id)、rescue_publicationsのunique(room_id,channel,ordinal)を利用可能。公開候補の絞込・並べ替えはサーバー内で実行する。実運用規模のEXPLAIN/応答時間目標は別途必要で、返値上限だけを性能保証としない。

## 権限と統合

privileged実装は非公開schemaの `private.raid_top_snapshot_v1()`。SECURITY DEFINER、search_path=pg_catalog、完全修飾テーブル、auth.uid確認、現在Guild条件を関数内で実施。public側はSECURITY INVOKERの薄いwrapper。両関数のPUBLIC/anon/service_role実行権限を撤去し、authenticatedだけに必要なexecuteとprivate schema usageを付与する。元テーブルのRLS/権限は維持する。private schemaをData APIへ追加しない。

親が日次オブジェクト→集約オブジェクトの順で上記2本の正式migrationへ統合済み。正式migrationにはtransaction境界を設けている。DB適用・advisors相当の検証は親担当であり、この文書だけをPreview/本番DB適用済みの根拠としない。

参照した公式資料: [Supabase changelog](https://supabase.com/changelog)（2026-09-09確認、今回の関数権限に該当する直近breaking変更なし）、[Database functions](https://supabase.com/docs/guides/database/functions)（SECURITY INVOKER、search_path、EXECUTE権限）。

## 検証引継ぎ

C/親の隔離localhost PostgreSQL検証対象:

- 未認証・本人不在の拒否。anonの公開RPC execute拒否。
- 参戦中/救援0件、複数、各20件上限、顔5人上限、主催者重複除外。
- active/HP0/期限境界/撃破終了/前日開始の有効開催。
- ACTIVITY、GUILD本人所属、非所属、脱退・移籍、最新閲覧不可と過去公開可、同時刻ID順、同room重複除外。
- 主催者/通常参加/救援参加、所属なしnull、未知leader、正しいfavorite_character_id。
- 日次2エリアが選択肢・新規受付と一致し、成功要求の日跨ぎ再送を保持。
- 読取前後にHP・参加・報酬・救援台帳の変更がないこと（日次初回確定は除く）。

AのローカルDB実行は担当外。実行結果はC/親の統合検証報告を正本とする。Preview接続と実機受入は別判定。



## Preview適用前提と順序（次工程）

- 前提: 既存SQL250〜263のレイド基盤、現行7エリアのcanonical_raid_variants、users.favorite_character_idが揃っていること。
- 順序: `20260908175140_raid_top_daily_authority.sql` → `20260908175143_raid_top_aggregate_api.sql` → 対応フロントエンド。日次関数を先に用意し、集約RPC提供後に画面を接続する。
- privateはData APIの非公開schemaのまま維持する。Cron・作成/戦闘/救援の運用フラグなどの設定変更は不要。
- 実環境への適用は本工程では行わない。隔離ローカル検証の成功をPreview接続成功と扱わず、次工程で権限・RPC・画面取得を確認する。
