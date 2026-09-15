# Raid第13工程 検証記録

2026-09-08。RAID-C-13の機械検証。親レビュー・全体型/ビルド・統合判定は親記録を参照。

## 方法

一時PGlite（0.5.8 / PostgreSQL 18.3 WASM）へSQL250〜260と既存fixtureをロード。戦闘Resultの実validate、確定triggerを実行する。Presentは135の実 `grant_present_payload` と `claim_present` を抽出して使用し、必要な既存schema列/表のみfixtureに追加した。外部DBへの接続・変更・Deployなし。SQLケースはそれぞれROLLBACK。

Auth、編成総合力、敵Snapshot、旧ミッション等の依存は既存fixture doubleであり、本番全schemaやAuthサービスを複製したものではない。テストCASH37/戦数1〜2/Damage100〜200は検証専用値で、製品の報酬マスター値ではない。

## 実行コマンド

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-rescue-rewards-run.mjs
node --experimental-strip-types --test tests/raid-room/rescue-reward.test.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-browser-tests.mjs
```

## 結果

- SQL新9件PASS。SQL260 SHA256: `ea6c3eefc40f23ab75460ffddef23ed6c2751130e141fdb1887adf086d30d742`。
- adapter新3件PASS。指定Roomのread RPC、未設定と通信失敗の区別、別Room/不完全発行/不正数量の拒否。
- React既存22＋新2＝24件PASS。取得失敗後再試行・準備中を成功と表示しないこと・発行明細/受取済表示・Present取得callback失敗後もダイアログを保ち、再試行成功を確認。
- `git diff --check` PASS。

SQLでは未設定の発行なし、未CLEAR/作成者の対象外、他参加者のCLEARによる条件達成済み救援者への自動送付、30日期限、撃破前開始/撃破後確定、再確定での二重送付なし、期限終了のみの不成立、戦数とDamageのANDを確認した。実claim_presentでCASH増加、受取済更新、再送/他人/期限切れ拒否を確認。本人参照・匿名/直接台帳/内部発行権限も確認した。

初回SQL1件はテスト期待を修正。未設定は非参加者にもunconfiguredが優先される契約のため、権限ケースに設定fixtureを追加した。製品実装の不具合修正ではない。

## 未検証

PGlite単一接続のため実複数接続競合/ロック待ち・実DBの全FK/trigger・実Auth/RLS全構成・実Cron・実機は未検証。Reactは実コンポーネント＋JSDOMでCSS描画や端末Human PASSではない。報酬品目/数量投入、通常参加者/主催者報酬、ランキング切替、運用有効化は対象外。
