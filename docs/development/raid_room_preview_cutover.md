# Raid Room Preview 切替手順

2026-09-08 / 第18工程で切替手順を更新。
照合基準: `45dcaba09ac0872c976b5fdcbf773beb096813f2`（PR #27、第16工程）。この文書は実行手順の準備であり、実DB適用・配信・有効化・実機確認の完了記録ではない。

## 現時点の結論

**DB → Edge → UI の順で独立Previewへ接続する。第18工程で旧Raidの生成・新規開始停止設定と旧画面置換を追加した。実環境での切替は未実施。** 数値は変更可能な設定として投入し、HP導出研究を準備の開始条件にしない。

|経路|第18工程までで確認した動作|切替時の扱い|
|---|---|---|
|旧一覧 `get_active_raids()`|SQL254で `rotate_daily_raids()` を呼び、日次生成・5分後respawnを進める|純粋な読取ではない。DB監査の読取RPCとして呼ばない|
|旧生成 `rotate_daily_raids()` / `respawn_cleared_raid_slot()`|Room台帳に載るInstanceだけ除外。旧生成停止設定は参照しない|Cron停止だけでは不十分。入口を含めた停止guardはSQL263に追加。管理者が旧設定enabled=falseにする|
|旧開始 `start_raid_battle()`|旧InstanceのACTIVE・期限・Lv/RP等を判定。Room専用設定は参照しない|新規開始停止guardはSQL263に追加。管理者が旧設定enabled=falseにする。確定RPCと一緒に停止しない|
|新UIの公開設定|`NEXT_PUBLIC_RAID_ROOM_UI_ENABLED === "true"` でRoom一覧へ置換する|第18工程で旧画面を非表示にする。DB側の旧停止は別途必要|
|起動時の旧一覧取得|Room UI trueでは副作用のないRoom一覧参照、falseでは旧 `get_active_raids`|Room参照失敗時に旧RPCへフォールバックしない。旧クライアント対策はSQL263|
|新旧確定の選択|SQL256の台帳・開始receiptをEdgeが参照し `LEGACY` / `ROOM` を判定|旧開始済みReplayを旧経路で完了できる状態を保持|
|順位報酬|SQL261でRaid順位生成・順位報酬・Season更新を停止|停止済み設計を再開しない。他カテゴリ・発行済みPresentは保持|

## 接続前に記録する項目

- 独立Previewのproject ref、DB接続先、Auth URL、テスト用ユーザー/Guild。Production `ktpolnkyyfkowxdmijww` をPreviewの接続先にしない。
- 配信project・Preview URL・配信SHA、DB差分適用の一覧、Edge `resolve-battle` の版と接続project。GitHubのPR headだけを配信SHAとみなさない。
- 既存DBのmigration履歴と実スキーマ/関数。番号だけで適用済みを断定せず、00250以前の依存テーブル・正本マスター・Replay・Present受取を確認する。
- `pg_cron` の利用可否、既存jobの名前・command・実行履歴。旧job名は未照合なので推測で指定しない。
- 実機用の救援戦数/貢献閾値、討伐貢献閾値、両報酬の品目ID・数量・rule_version。未承認の候補値を確定値として投入しない。

## 適用と確認の順序

以下は実施可能な接続先と変更権限を持つ担当が、対象を固定して行う後続工程。今回実行していない。

1. **DB差分を確認し、必要な00250〜00263を昇順適用する。** 00254の旧経路分離、00256の確定分岐、00257/258の復帰、00259/260の救援、00261の順位停止、00262の討伐報酬、00263の旧運用停止設定を欠落させない。既適用migrationを無条件で再実行しない。Room系の初期運用設定はfalseのまま確認する。旧設定は初期trueなので適用だけでは旧運用を停止しない。
2. **DBのRPC・権限を照合する。** 特に `get_raid_battle_route_v1` は新Edgeの旧Raid確定にも必須。新UIの本人貢献取得には00261、討伐報酬参照には00262が必要。公開RPCは本人Auth、確定はサービス経路で確認する。
3. **Edgeを同じPreview DBへ反映する。** 固定SHAの `resolve-battle` と依存ファイルを合わせる。旧開始済みReplayの確定と再送が従来結果を返し、Roomを旧確定へ誤配送しないことを確認する。
4. **UIを同じSHA・同じPreview DBへ反映する。** Mock動作を実DB確認の代わりにしない。`NEXT_PUBLIC_RAID_ROOM_UI_ENABLED` はbuild時の公開設定なので、変更後の配信SHA/生成物を確認する。
5. **旧生成・新規開始を停止する。** DB管理者が `raid_legacy_settings` のsingleton行を `enabled=false` へ更新する単独transactionを使う。他の業務rowを先にlockせず、timeout時はROLLBACKして停止成立を確認し直す。先行した開始/生成が終わって停止commitが成立した後の呼出しが対象。開始済みReplayの確定とPresent受取は止めない。旧一覧は空・旧startは55000・rotate/respawnは無変更になることを確認する。
6. **テスト用設定を投入し、その後で独立Previewの新規操作を有効化する。** 下表の設定は別物。救援・討伐報酬の値/品目を空のまま「報酬まで通るPreview」と宣言しない。SQL260/262の発行済み台帳を数値調整のために削除しない。
7. **複数ユーザーで一連確認し、実機へ渡す。** Room作成 → 公開参加/救援参加 → 戦闘 → 撃破/期限 → 救援・討伐Present発行 → 本人受取。同時確定、同一要求再送、終了後確定、Guild移籍、再読込復帰を含める。実機用URL・SHA・テスト条件と未完了点を添えて引き渡す。

|設定|正本|停止/有効化の意味|
|---|---|---|
|Room作成|`raid_room_creation_settings.enabled`（253、最新writer260）|新規Room作成。旧日次生成を制御しない|
|Room戦闘開始|`raid_room_battle_settings.enabled`（255、最新writer260）|新規開始を制御。既存開始receipt・確定とは別|
|救援依頼・救援参加|`raid_room_rescue_settings.enabled`（259、最新writer260）|新規依頼/救援参加。記録済み依頼の同一要求確認は残る|
|救援の成功条件|`raid_room_difficulty_rules`（251）|戦数/貢献/救援由来/撃破のAND。参加総合力は固定済み|
|救援Present|`raid_room_rescue_reward_rules` / `raid_room_rescue_reward_items`（260）|難度ごとの送付設定と品目数量|
|討伐Present|`raid_room_clear_reward_rules` / `raid_room_clear_reward_items`（262）|開催中確定の累積貢献が設定値を超過＋撃破。撃破打を含む。終了後確定は除外|
|旧生成・新規開始|`raid_legacy_settings.enabled`（263）|初期true。falseで旧一覧/生成/respawn/新規開始を停止。確定/Present受取は継続|
|Room画面|`NEXT_PUBLIC_RAID_ROOM_UI_ENABLED`（RaidTab/GameContext）|trueで旧画面/旧一覧取得をRoom方式へ置換。サーバー停止は別設定|

設定テーブルにはクライアントから変更できないものがある。実施担当の正規のmigration/DB管理経路を使用し、ブラウザからのUPDATEや権限緩和で代用しない。

## 期限処理と開始済み戦闘

00257はjob `raid-room-expiry-minute` を毎分登録し、`finalize_expired_raid_rooms_v1(100)` を実行する。適用時にCron登録が発生するため、RoomフラグがfalseだからCronも止まると考えない。実job稼働・期限終了・次の周回で取り残しが処理されることは実DBで確認する。

SQL263の旧rotate停止は旧期限巡回も止める。残る旧Instanceの期限確定が必要な場合は既存サービス専用 `finalize_expired_raid_instance` を別途使用し、旧生成の再開で代用しない。

切替時点の旧未確定Replay ID/状態とInstanceを保存して照合する。既存Replay・snapshot・seed・ログ・報酬台帳は保持し、Roomへ付け替えない。新Edgeは旧ReplayをSQL254の `finalize_raid_battle` へ送り、Roomには専用確定を使う。旧確定の期限後挙動を新Roomと同一だとは扱わず、旧経路の既存処理として検証する。順位報酬の遡及付与は行わない。

## 不具合時の復旧

1. Room作成・新規戦闘開始・救援新規依頼/参加を各設定で停止する。画面非表示だけを停止策にしない。通常参加登録そのものを止める独立設定は確認できていないので、全書込停止とは報告しない。
2. 既存開始receipt・復帰・確定・Present受取を保持し、消費済みRPや送付済み報酬を自動で戻さない。重複付与の疑いがある場合だけ該当報酬の発行設定を止め、停止期間の未発行を記録する。後から設定を戻すだけで自動再送される保証はない。
3. UIはRoom対応済みの既知正常版へ戻す。Roomが作成/開始された後は、Roomルートを知らない旧Edgeへ単純に戻さない。DBは破壊的rollbackを避け、必要箇所を前進修正する。
4. 原因修正後、停止中のReplay/報酬未発行を照合してから限定再開する。ユーザー資産の削除、旧順位報酬再開、全履歴の再計算を復旧手順に含めない。

## 根拠と残件

第17工程の固定SHA読取照合: SQL251/253/254/255/256/257/259/260/261/262、`supabase/functions/resolve-battle/index.ts`、`src/app/components/RaidTab.tsx`、`src/app/context/GameContext.tsx`、`docs/development/raid_room_cutover_remaining.md`。

残件は、実環境での旧運用停止と切替確認、実機用設定、独立Preview DB/Edge/UI接続、実Cron/実多接続/実機受入。第18工程でも実DB・Deployを実施していない。文書の親レビュー完了は、実機確認可能Preview到達を意味しない。

第18工程の追加根拠: SQL263、raidRoomActivity.ts、RaidTab/GameContext差分、raid_room_phase18_integration.md。
