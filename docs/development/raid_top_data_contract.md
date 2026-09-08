# レイドトップ表示契約（RAID-TOP-B-01）

基準: `70cb1f28263e5b23399709d1b4b3a7d0e96283e2`。DB/Edge/運用設定は変更していない。

## 実データとの対応

|表示項目|基準内の取得元|トップへの接続状態|
|---|---|---|
|レイドID、主催者ID/名前、難度、HP、期限、登録人数|`list_raid_rooms_v1` / `get_raid_room_v1` の投影|既存全体一覧・詳細導線で継続使用。トップ一括取得には不足|
|敵variant/エリア/敵名|`get_raid_room_briefing_v1`|詳細専用。カードごとの追加取得をしない|
|本人参加|briefingのmembershipStatus（joined / not_joined）|本人参加一覧APIなし。主催/通常/救援区別の一括投影もなし|
|主催者リーダー画像|room.owner.leaderIconUrl|現在SQL投影はunknown|
|主催者Guild、参加者顔|参加者個別RPC。画像はunknown|本人参加制約があり救援閲覧では参照不可。トップでカード別取得しない|
|救援元ID|Activity metadataのroomId/rescueId、Guild Chatの参照|既存救援参加導線は両IDを保持。戦況・敵・参加状態を含む救援一覧はなし|
|日次2エリア|新レイド対応の正本なし|unavailable。表示契約とローカルMockのみ|
|敵5体・7エリア画像|canonical raid production master、character master、既存battle area presentation|`raidTopAssets.ts` で実マスターIDから解決|

`RaidObserved.unknown` は未取得、`available(null)` は確認済み未所属等。人物・Guild・参加者数・敵を推測で埋めない。人数は登録参加数でありオンライン数ではない。

## 調査根拠と現在の制約

- SQL253 `list_raid_room_boss_choices_v1` は全 `is_production_enabled` variantを返す。
- 挑戦受付の最新定義はSQL260 `create_raid_room_v1`。有効variantは確認するが日次対象は確認しない。SQL253の旧定義だけで判定していない。
- 旧 `canonical_raid_rotation_pair`（SQL210）と旧生成（最新SQL263）は新レイドの挑戦受付につながっていない。日付から旧ペアをクライアント計算して本日の対象としない。
- SQL255は `raid_room_can_read_v1` を全認証ユーザー向けに変更した。したがってSQL250の `list_raid_rooms_v1` は本人参加一覧ではない。先頭ページを本人参加の正本と扱わない。
- SQL250/252で `raid_rooms` / `raid_room_members` はdefault-deny RLS＋直接権限revoke。後続migrationにも本人SELECT許可はない。クライアントJOINで回避できない。
- 未確定戦闘のrecovery一覧は本人参加一覧の代用にならない。
- SQL240の汎用最新Activity feedは救援の網羅一覧ではなく、SQL259の救援参照は1件のID検証。戦況・敵・Guild・参加アイコンを取得するバッチRPCはない。

このため本番 `useRaidTop` は現時点で参戦中・救援・日次対象を **unavailable** と返す。0件/取得エラーと同一視しない。実装済みと報告するのは表示・契約・既存導線のみで、これらトップの実データ接続は未完了である。全体一覧はユーザーが開いた時のみ既存導線から取得する。

## 次工程で必要なサーバー契約（仕様案、未実装）

認証済み・副作用なしの上限付きトップ投影を1回で返す。本人IDは `auth.uid()` のみで確定する。

- 参戦中: 本人台帳から抽出。`RaidTopEntry[]` と次ページカーソル（追加ロード時のみ取得）。stateはactive/cleared/expiredを保持し帰還更新できること。
- 救援: 本人が閲覧可能なActivity/Guild救援のみ。roomId/rescueId/sourceを保持し既存参加受付へ渡す。救援資格判定は既存RPCのまま。複数公開先の同一レイド重複方針を確定する。
- 各カード: 主催者ID/名前/画像/Guild、variantId、HP、期限、登録参加数、上限付き参加アイコン、本人のowner/member/rescue/not_joinedを一括投影。未取得をunknownで返す。
- 日次対象: JST date keyと異なる2エリアのvariant ID。サーバーで毎日ランダム選出・固定し、参照と新規挑戦受付で同一正本を使う。既存レイドの24時間・撃破終了・日跨ぎ参加は維持。
- 認証切替/帰還/手動再取得は最新レスポンスだけ採用。`useRaidTop.loadTop` はこの一括参照とローカルMockの注入境界であり、未存在のRPCを本番へ送らない。

`resolveRaidDailyTargets` はちょうど2件・異なるエリア・有効日付・既知variantのみ解決する。日付生成や抽選は行わない。

## 素材と状態表現

`RAID_TOP_ENEMIES` は素材目録であり日次対象ではない。canonical masterの5人順をそのまま使用し、先頭の画像をカード代表として表示する。必要画像は既存素材のみ。画像取得失敗時は別人物/別エリアで埋めず中立のUIフォールバックを使う。

このデータ層では『撃破目前』『楽勝』『討伐困難』等の推定状態を生成しない。HP率と残り時間は既存観測値だけを使う。戦闘計算・報酬・MVP・Result・Replay/ackを変更しない。

## 残タスク

日次2エリア正本と上記トップ一括参照の実装・権限レビュー・実DB検証。実機ビジュアル受入。報酬ダイアログのスクロールと参加者プロフィール遷移は本工程外として保持。
