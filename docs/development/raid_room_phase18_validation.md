# Raid 第18工程 検証記録

状態: **VALIDATED（親レビュー・再実行完了。実機PASSではない）**

実施日: 2026-09-08。基準SHA `f65e7c460d42bd1dcbc71411a6c0a602a49de015` に対する旧レイド切替準備の検証。実DB接続、Deploy、運用設定有効化は実施していない。

## 実行方法

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/3f215bc02a8a/raid18-test-runtime node tests/db/raid-legacy-cutover-run.mjs
node --experimental-strip-types --test tests/raid-room/activity-cutover.test.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/3f215bc02a8a/raid18-test-runtime node tests/raid-room/run-ui-cutover-tests.mjs
```

`RAID_TEST_RUNTIME_DIR` は一時テスト依存ディレクトリ。DB接続URLではない。

## 結果

|対象|結果|確認内容|
|---|---|---|
|SQL263・既存SQL254の旧経路|11件PASS、FAIL/SKIPなし|defaultの2枠生成・無料/RP開始・respawn維持、停止後の生成/一覧/respawn/新規開始無副作用、開始済み通常/致死確定、同一再送、設定ACL、欠落時停止|
|実loadRaidActivity|4件PASS、FAIL/SKIPなし|Room全ページ取得と開催中最大期限、終了/HP0/不明情報除外、失敗時旧RPCへfallbackしない、false時旧応答維持|
|実RaidTabのReact表示|3件PASS、FAIL/SKIPなし|true時旧UI/旧取得なし・Room接続props保持、false/未設定時旧一覧を表示|

SQL実行エンジン: PostgreSQL 18.3 / PGlite 0.5.8（WASM）。Node v24.19.0。

SQL263のSHA256:
`e9ad475d7afb5e6ed97da918d74b71e0acd875e2f41db794d8e69dc0999a7a75`

## Fixtureと限界

SQLは既存 `raid-room-read-projection-fixture.sql`、lifecycle・creation・legacy-isolation fixtureに、実Migration250〜254と263を適用している。旧rotation・開始・確定・respawn本体は実SQL。既存fixture内のSnapshot構築・回復・ミッション等は呼出し記録doubleであり、戦闘計算/回復量/ミッション内容そのものの検証ではない。SQL255〜262を全て適用したDBの通し検証ではない。ローカルfixture内の停止設定更新だけを実行し、外部DBには接続していない。

停止前の実start_raid_battleで発行したReplayを停止後に実finalize_raid_battleで確定し、非致死・致死と再送を確認した。状態比較ではユーザー、ボス、Room、Replay/Event、Damage/進捗、Present、報酬/日次台帳、呼出し記録を確認。ACLはテーブル権限照合とauthenticated更新拒否、旧確定関数の既存実行権限を確認した。

React検証は実RaidTabをJSDOMへ描画する。GameContext・DBクライアント・画面readiness・子のRaidRoomConnectedBrowserはdouble。Room子へ渡す本人/救援ID、AuthorityとPresent/出撃準備callbackを確認するが、Room子内部の戦闘/報酬動作の再検証ではない。GameContextのbootstrapは実helperを個別実行し、接続元のloadRaidActivity呼出しとmode分岐をソースで照合した。GameContext全体をmountした認証journeyではない。

CSSレイアウト、実端末表示、実ネットワーク、複数接続のlock競合、実Cron、Preview/Production適用は未検証。型検証・全体build・親レビューは親統合で別記する。これらの18件PASSを実機確認可能やレイド全体完成とは扱わない。
