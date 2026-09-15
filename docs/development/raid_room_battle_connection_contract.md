# Room参加登録と戦闘接続の契約

2026-09-08 JST。RAID-B-07。照合基準は第6工程 `24fca1d58bf8ffab2687da8a70959b2f5670f34f`。本書は次工程の接続設計であり、公開参加・戦闘接続の実装完了を示さない。ゲーム条件の正本は [raid_room_rescue_v1.md](../../specs/raid_room_rescue_v1.md)。

## 現行経路と問題

|対象|確認した実装|接続時に必要な差分|
|---|---|---|
|Room controller|`src/domain/raidRoomClient.ts` の `joinRoom` は `{roomId,replayId}` を返す。`join()` は `serverEligibility=eligible` の場合だけ要求し、成功後にRoomを未取得へ戻す|参加台帳の登録成功と、RP消費を伴う戦闘開始（初回無料を除く）成功を別の結果型にする|
|Room adapter|`src/domain/raidRoomRpcTransport.ts` の `authorities.joinRoom` は注入境界であり、公開参加RPCを実装していない|既存注入を参加登録RPCへ置き換えない。参加結果を偽のReplay参照へ変換しない|
|Room画面|`RaidRoomBrowser.tsx` はjoin成功直後に `onBattleReady(reference)` を呼ぶ。画面遷移失敗時は保持した同じ参照で表示を再試行する|参加後の事前確認と、既に開始したReplayを開く処理を区別する|
|製品画面|`RaidTab.tsx` の `openBriefing` は背景を先読みし、`startCardBattle("RAID",...,instanceId,...)` を呼ぶ|Roomを既存日次一覧のInstanceとして扱わず、専用の表示情報を渡す|
|戦闘フック|`src/hooks/useBattle.ts` は `startCardBattle` で `prepareOnly=true`、`confirmPreparedRaidBattle` で実開始する。`GameContext.tsx` はその操作を公開する|事前確認画面を再利用し、開始要求は確認操作の一度だけ行う|
|開始前表示|`useBattle.ts` は `get_active_raids` のInstance照合と `raid_boss_master` を利用する|Room専用の事前表示取得を用意し、旧一覧への混入に依存しない|
|開始・結果|`useBattle.ts` は `start_raid_battle` → `resolve-battle` → `get_current_raid_battle_rewards` と接続する|Room専用開始と結果投影へ明示的に分岐する。旧報酬取得を新Roomの報酬資格として使わない|

現行Room DTOにはInstance ID、ボス名、背景エリア、敵編成の参照情報がない。Room IDを既存 `p_instance_id` へ渡す方法では接続できない。現在のSQL00250は `serverEligibility` を常に `unknown` とし、参加許可の実装とはなっていない。

## 既存APIを維持した追加境界

第7工程では型・controller・adapter・画面を変更しない。現行 `joinRoom(request): Promise<RaidBattleReference>`、`controller.join()`、`onBattleReady` は既存QAと注入先の互換を維持する。これは「開始済み戦闘参照を返す既存接続」であり、参加台帳更新専用APIではない。

次工程では別の操作名と結果型を追加する。以下の名称はアプリケーション境界の案であり、配置済みRPC名ではない。

|操作案|結果・責務|行わない処理|
|---|---|---|
|`registerParticipation({roomId,rescueId?})`|サーバーが公開範囲・本人・参加下限・定員・終了状態を検証し、参加台帳の結果を返す。例: `{roomId,membershipStatus:'joined'\|'already_joined'}`|Replay生成、戦闘RP消費、救援成功や報酬資格の確定|
|`prepareBattle(roomId)`|権限を検証した事前表示DTOを取得し、編成・背景を事前確認画面へ渡す|参加済み事実から戦闘開始可能と決めつけること、RP消費|
|`startBattle({roomId,characterIds,tactic,requestId})`|開始時のサーバー再検証、確定Snapshot・seed・Replay・RP消費の一体処理。既存Replay表示に必要な正規Snapshotと残RPを返す|クライアント計算による共有HP更新、ローカルReplay生成|
|開始済みReplayを開く操作|RoomとReplayの関連・本人権限をサーバーで検証し、同じReplayの取得・確定・表示を回復する|新たな開始要求、再消費|

参加登録と戦闘開始を分けることは、参加者待機や開始待ち時間を新設することではない。登録後すぐ事前確認から戦闘へ進める。Ownerは作成時に登録済みであり、参加登録を繰り返さないと開始できない構造にしない。

## Room専用の表示・戦闘橋渡し

専用の事前表示DTOには `roomId` とサーバー確認済みのInstance対応、ボス名・マスター参照・背景情報・表示用敵編成参照を持たせる。具体的な返却形式はサーバー担当との実装契約で固定する。公開権限を広げるために旧 `get_active_raids` を再利用しない。Room IDとInstance IDは別種の識別子として扱う。

`useBattle` への接続は識別できるRoom用入口を追加し、旧非Room入口の引数や挙動を保持する。事前表示から開始までRoom参照を保持し、確認時だけ新Room開始処理を呼ぶ。開始済みReplayの参照を受け取った後に通常の `startCardBattle` を呼んで、再度開始RPCを実行する接続は禁止する。

戦闘表示には正規Snapshot・Events・既存の演出とスキップ処理を再利用する。結果画面から戻る際のRoom IDを保持し、共有HP・参加者・資格を再取得する。表示再開のために開始時の編成や現時点のマスターで保存Replayを再生成しない。既存 `battle_sessions` による復帰処理へのRoom参照保存も後続の排他的な戦闘フック変更範囲に含める。

## 再送・競合・資格の扱い

- 参加台帳の `already_joined` は登録済み事実であり、終了後でも戦闘可能という意味ではない。参加資格と戦闘開始資格を別の文脈で投影する。既存 `serverEligibility` の意味を黙って変更しない。
- 開始要求の再送は同じ `requestId` と同じpayloadで同じReplayを返す必要がある。異なるpayloadの同一IDは拒否する。新しい戦闘と通信結果不明の再試行を区別する。
- 現行 `confirmPreparedRaidBattle` は失敗後に開始処理全体を再実行する構造である。Room接続時は開始済みReplayを回復する状態を持たせ、resolveや報酬参照失敗から新規開始へ戻さない。
- 選択変更・画面破棄で古い応答を画面へ適用しない既存revision制御と、文字なしスピナー・全体操作ブロックを維持する。クライアントの連打抑止をサーバー冪等性の代替にしない。
- 期限・撃破・総合力変更は開始時にサーバーで再検証する。Main Formationと実出撃編成のどちらを下限判定に使うかは本書でFIXしない。
- `rescueId` の存在だけで救援経由を認定しない。サーバー側の公開対象・所属・救援記録と照合する。救援帰属のタイミングは未確認事項として維持する。

## 第7工程と次工程の境界

第7工程のSQL担当は旧経路からRoomを分離し、検証担当が非Room回帰と分離を確認する。本書はその実施結果を先取りしてPASSとしない。生成設定はfalseを維持し、分離が通っただけで生成・公開参加・戦闘を有効化しない。

次の実装契約では、公開対象の参照権限、参加登録、事前表示DTO、開始とReplay回復、Room結果投影の順に依存を揃える。`useBattle.ts` と `GameContext.tsx` は親が一人の担当へ排他的に割り当てる。未確認の公開範囲・編成判定・期限後確定・救援帰属・報酬切替は仕様書の残事項として保持し、暫定HP等のバランス再研究とは分けて扱う。

後続検証には、参加登録でReplay/RPが変わらないこと、Ownerが二重登録されないこと、事前確認キャンセルで消費しないこと、同一開始再送でReplay/RPが重複しないこと、確定後表示失敗から同じReplayを開くこと、期限/撃破との競合、Room外の既存開始・結果経路の維持を含める。本書の作成のみではこれらの機械検証・実DB・実機確認を完了としない。
