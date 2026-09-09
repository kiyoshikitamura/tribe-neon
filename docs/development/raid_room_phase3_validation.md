# Raid 第3工程 — SQL / RPC検証

2026-09-08、RAID-C-03。親レビュー修正後の新00250とRPC adapterを対象に **18件 PASS（SQL・SQL応答接続9件、adapter9件）**。全体型検証・画面・実機判定は親の記録を参照する。

## 再実行

Node 24.19.0、PGlite 0.5.8（PostgreSQL 18.3 / wasm）、tsxを利用。依存はRepositoryのpackage/lockへ追加しない。

```sh
npm install --prefix /absolute/scratch/raid-test-runtime --no-audit --no-fund @electric-sql/pglite@0.5.8 tsx@4.23.13
RAID_TEST_RUNTIME_DIR=/absolute/scratch/raid-test-runtime node tests/db/raid-room-read-projection-run.mjs
```

runnerはメモリー内PGliteを作成し、外部URL・DB資格情報を受け取らない。fixtureを投入後、Repositoryの00250 migrationを無改変で実行する。終了時にDBを閉じる。テスト用参照は `BEGIN READ ONLY` と `SET LOCAL ROLE authenticated` または `anon`、必ず `ROLLBACK` を使用。fixtureの生成・状態変更はローカル一時DBだけで実行する。

## 検証範囲

- Owner・確定参加者・参加記録あり未確定メンバーの参照と一覧。未参加第三者は非公開。
- 不存在と閲覧不可を同じP0002、未認証およびanon呼出しを42501で拒否。
- RLS有効、authenticated直SELECT/INSERT権限なし、内部helper EXECUTE不可。
- Ownerの未戦闘表示、確定戦数0、記録がないDamage/Guild Snapshotをunknownとして保持。
- Room別集計、raw 400 / applied 340 の差、現在Guildと最後の確定戦Guildの分離。
- listページング・難度フィルター・不正引数拒否。
- 期限超過ACTIVEはexpired投影、HP0 ACTIVEはunknown投影。DBのstatusは書き換えない。
- 参照後のHP・ログ・Room不変。
- SQLの実返却JSONをadapterで受理し、serverEligibility unknownのまま保持。
- adapter全ページ取得、不正DTO・別Room・通信失敗・循環ページ拒否。
- 参加・報酬Authority未注入は明示失敗。注入時のみ検証済み返却値を受理し救援IDを保持。
- ineligibleの空理由配列は保持。eligibleへ拒否理由を混入した矛盾応答を拒否。

## fixtureと検証限界

`raid-room-read-projection-fixture.sql` は参照に必要な既存6テーブルと `auth.uid()` の最小schema。ユーザー、Boss、progress、Guild、membership、Damage logを定義する。Authはセッション設定からUUIDを返すstub。実migration全件、既存trigger・RLS・extension・PostgREST・JWT署名検証は再現していない。新規Roomおよびmemberテーブル・関数・権限はstubではなく00250本体を実行する。

PGliteはPostgreSQL実エンジンのWASM版であり、Productionと同一バージョン・拡張構成の保証はない。READ ONLY SQL・GRANT/REVOKE・role動作の検証であり、Production/Preview適用済み、実Auth通信成功、同時確定競合成功を意味しない。

Room生成・参加確定・戦闘開始・救援公開・報酬発行・Present受取・本番切替は今回未接続。これらを空成功として扱うテストにはしていない。既存監査の未確認点と構造条件はspecに残す。
