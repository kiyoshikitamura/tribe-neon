# Release DB readiness checklist

更新日: 2026-09-02

この文書はPreviewからProductionへDBを昇格する直前の停止条件を定義する。
Production、Previewへの書込み承認を与える文書ではない。

## 現在の判定

`BLOCKED`

- `20260901000216`のmigration versionが2ファイルで重複している。
- Productionの最新schema fingerprint、migration history、データ件数、backup状態が未取得。
- Previewは`00230`まで適用済み、`00231`と`00232`は未適用。
- 2026-08-13のProduction証跡にはAuth userが1件あり、データゼロとは判定できない。

## 00216衝突の解消手順

既にPreviewへ登録されたversionを推測でrename、削除、repairしてはならない。

1. Previewの`supabase_migrations.schema_migrations`からversion、name、statementsを読み取る。
2. `get_pvp_opponents_page(uuid,integer,integer)`と
   `apply_tutorial_enemy_snapshot(uuid,jsonb,jsonb)`の実定義とgrantを取得する。
3. 2ファイルのどちらが履歴登録され、どちらが物理適用だけされたかを確定する。
4. 新しい一意versionのforward-only convergence migrationを作る。
5. convergenceは両関数の現在の正規最終形を冪等に保証する。
6. Previewへ適用し、clean replayと既存Previewのschema fingerprintが一致することを確認する。
7. その証跡が揃ってから、重複したhistorical fileの扱いを決定する。

監査前は`config/supabase-migration-collisions.json`のhashを変更してはならない。

## Repository gate

監査用途では既知BLOCKERを保持したまま構造を検査できる。

```bash
node scripts/verify_release_db_migration_readiness.mjs --allow-known-blockers
```

Release gateでは既知衝突もFAILにする。

```bash
node scripts/verify_release_db_migration_readiness.mjs
```

## Preview preflight

- [ ] 接続先がcanonical Preview refと一致
- [ ] migration historyを保存
- [ ] schema fingerprintを保存
- [ ] `00231`、`00232`が未登録であることを確認
- [ ] `00216`のname/statementsと両関数定義を取得
- [ ] master version `2026-08-21`と`2026-08-30`が有効
- [ ] `00231`、`00232`を番号順にguard付きで適用
- [ ] `00221`、`00224`、`00231`、`00232`を含む全postflightを実行
- [ ] RLS、RPC、grant、cron、Realtime、Edge Functionを監査
- [ ] clean replayとのschema fingerprint一致

## Production preflight

- [ ] 明示的なProduction変更承認
- [ ] target guardとcanonical ref一致
- [ ] schema fingerprintと全object inventoryを読み取り取得
- [ ] migration history 0件の理由とbaseline方針を承認
- [ ] Auth user、public user、残高、所持品、報酬ledger、ranking履歴の件数確認
- [ ] QA userが0件
- [ ] Production backup取得時刻、PITR範囲、restore先を記録
- [ ] 別環境へのrestore drillがPASS
- [ ] migrationごとのforward recoveryとアプリrollback SHAを記録
- [ ] Ranking migrationが既存season報酬を生成しないことをpreflightで証明
- [ ] Preview RCとProduction baselineの差分をレビュー

## 適用順

1. Repository collision解消
2. Preview clean replay
3. Preview postflightとDB adverse test
4. Production read-only baseline監査
5. backupとrestore drill
6. 明示承認
7. Production migrationを一意version順に適用
8. migration単位postflight
9. schema、master、RLS、RPC、grant parity
10. 報酬二重付与、他者操作拒否、データゼロを確認

## 自動停止条件

- migration version重複
- historyとrepository versionの不一致
- unknown schema差分
- backupまたはrestore未確認
- Productionに未分類user/dataが存在
- ranking期間重複、報酬ledgerとPresent不一致
- authenticated/anonへservice-only RPCが公開
- master payload不一致
- rollback先アプリSHAが未固定

停止条件をskip、force、手動history登録で回避してはならない。
