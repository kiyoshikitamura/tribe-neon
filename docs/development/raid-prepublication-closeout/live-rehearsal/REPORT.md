# B：既存専用Previewでの実接続検証

判定：**実Auth → 通常/救援参加 → 実Edge戦闘 → 討伐 → 報酬発行/受取 PASS**。固定候補は `8c0fa6b2131faaed7b63e172ac12424d3fe8f6be`。ブラウザーでの操作・人による受入はこの記録に含めない。

## 対応する配信とDB

- 専用Preview：`sufvuqdnqohpfzkwxohq`、ACTIVE_HEALTHY、PostgreSQL17。
- 固定候補フロント：`dpl_ED1F6kxMiv12LQXaLwv72T1Mfbxk`、https://tribe-neon-fq91mseva-kiyoshi-kitamura.vercel.app 。READY/設定/aliasなしの確認は親担当の証跡を参照。BはHTTP認証/RPC/Edgeを検証し、このURLをブラウザーで操作していない。
- `resolve-battle` v7 / verify_jwt=true、bundle hash `b762e7c25826f9a417c87cf550388e291f2c75d0e278599e6a1d3dcd70fd8b21`。配信ソース5ファイルは固定候補とLF正規化後すべて一致。Edgeを再Deployしていない。
- Preview447関数は固定Bundle適用後の隔離DB447署名すべて存在。Raid/初期装備の本文・戻り型・search_path・owner一致。8関数のみPreview側service_role EXECUTEが追加、匿名/本人権限は一致。16のKPI関数本文はProduction基準とPreviewで異なる。全DBが完全一致とは扱わず、アプリ本人経路の必要定義一致として検証した。SQL再適用なし。
- 履歴282件は補助情報。適用判定は実関数との照合を使用。共有KPI作業を認識し、グローバルDDL/フラグ/報酬設定/Cron/共有aliasへ変更を重ねなかった。

根拠：`edge-comparison.json`、`db-comparison.json`、`preview-function-catalog.json`。

## 今回の実行結果

専用QA3人の既存資格で実password認証→getUser本人ID照合→`get_raid_top_v1`成功。初期の古いrefresh tokenで通常役が失敗したため、既存private資格で再ログインした。資格・tokenはメモリー内だけで使用し、成果物に保存しない。

初回の新宿指定は当日の開催対象外として正しく拒否された。実TOPの日次対象からROPPONGIを選び直した。現在日付JSTは2026-09-10。

|対象|値|
|---|---|
|Room|`ee8b0e8a-1e25-43f1-bf09-30e37081d774`|
|boss instance|`1023c0f0-6025-4d53-af36-ef7cfa4f4e71`|
|variant / max HP|RAID_ROPPONGI_V1 / 34,000,000|
|参加|主催・通常・救援の既存専用QA3人|
|正規戦闘|8件：主催2、通常1、救援5|
|最終Replay|`e52898f1-d7cc-4804-a477-ffb661b2d718`|
|最終確定|2026-09-10 00:13:17 JST、DEFEAT_SUCCESS、HP0|
|救援貢献|18,337、5戦、現Preview条件2戦以上/16,000以上を満たす|
|復帰ack|8/8、未ack0|

全8件は認証済み`start_raid_room_battle_v1`→配信中Edge `resolve-battle`→DB確定→ack。SQLで戦闘結果・貢献・報酬台帳を作成していない。最終raw damage2,630、共有HP適用1,000。

|受取者|報酬|Present ID|結果|
|---|---|---|---|
|主催|討伐 EQUIP_EXP_S×1|710a77d0-151a-4c49-a0ea-80d0ce009d71|CLAIMED|
|通常|討伐 EQUIP_EXP_S×1|6b0b74e1-63ee-4d17-8cda-8c2a94ce7deb|CLAIMED|
|救援|討伐 EQUIP_EXP_S×1|2c427752-2321-4703-98cd-1b0fdc87058a|CLAIMED|
|救援|救援 CHAR_EXP_S×1|865a0702-91c8-4406-8b01-18aa9f5de078|CLAIMED|

4件を各本人の通常`claim_present` RPCで単件受取。4件とも再受取はP0001 `Present is not claimable`。最終Replayの実Edge再送も同じ確定結果を返し、独立READ ONLY照合でboss、damage8行hash、Present状態、3人の所持品hashが全て不変。主催/通常は救援報酬対象外。根拠：`live-state.json`、`duplicate-before.json`、`duplicate-verification.json`。

## 明示的なQA fixtureと保持

親の明示許可で、**この新規専用QA Roomだけ**のcurrent HPを33,974,394→1,000に調整した。3人以外の参加者がないこと、未確定Replay0、期待HP/ACTIVE/ownerをguardし、他boss全行hash不変を同transactionで検証。max HP・variant master・敵snapshotの強さは変更なし。その後の正規戦闘で討伐した。

救援の4戦後はRP0・貢献14,523で5戦目を拒否。親の明示許可でこの既存専用QAユーザーだけRP0→1をguardして補充し、通常開始RPCで1消費して最終RP0。回復時刻・回復ルールは変更していない。自然RP回復PASSには数えない。

SQL原文/実応答：`qa-hp-fixture.sql`、`qa-hp-fixture-result.json`、`qa-rp-fixture.sql`、`qa-rp-fixture-result.json`。実行済みで再実行しない。これらのHP短縮・RP補充・Preview報酬/閾値を公開設定へ持ち込まない。討伐済RoomをHP復元して復活させない。

`final-preservation.json` で4運用フラグ、難度条件、討伐/救援報酬ルールと品目一覧が開始前と一致。公開master HP34,000,000、RP0、Replay8、未ack0を確認。Production書込み・本番Deploy・公開切替なし。

## 自然期限終了の有効証跡再利用

過去の24時間監視専用Room `3972a461-b45f-4b02-8142-75f294461ae3` を今回READ ONLY取得。expires_atは2026-09-09 19:40:55.031663 JST、HP32,000,000を保ったまま19:41:00.160351にEXPIRED/TIMEOUT_FAILURE。Cron13の19:41:00.142082〜.165999成功run内にfinalized_atが位置する。前後毎分runも成功。既存の期限前観測と合わせ自然終了証跡として再利用し、24時間待機をやり直していない。

`finalize_expired_raid_rooms_v1(integer)` MD5 `be4bad717c6bc92feeb816559070b85f` は固定Bundle適用後と一致。根拠：`natural-expiry-read.json`。期限後の手動batch実行やHP/期限書換えは行っていない。

## 残る範囲

- 今回のHTTP実接続結果を、固定URL上の操作/演出や人の受入PASSにしない。UI工程は親担当の別記録。
- 旧開始済戦闘との境界・前進停止は前工程の固定Bundle隔離PG証跡を再利用し、共有Preview全体を停止して再試験していない。
- 公開用閾値/報酬/設定の判断は別担当。今回のQA設定を承認値として採用しない。
