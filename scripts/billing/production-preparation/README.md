# Production課金DB反映候補（2026-09-15）

状態：**ローカル候補作成・PGlite試験PASS。Production未適用。**
このフォルダの作業は読み取りとローカルファイル作成のみ。Deploy、Migration適用、Preview設定、資産変更、commit/pushは実施していない。

## 実環境の確認

- Production：`ktpolnkyyfkowxdmijww`。課金5テーブル・billing関数・billing triggerは未存在。
- MAINTENANCEを維持。開始値は2026-09-15 20:33:02.765894 JST。
- Preview：`sufvuqdnqohpfzkwxohq`。最終商品20件・課金5テーブル・対象12関数を読み取り保存。
- `claim_present(uuid)`、`claim_present(uuid,uuid)`、`claim_all_presents()`、`claim_all_presents(uuid)`は両環境で定義MD5が全件一致。
- 読み取り記録は`preview_readonly_snapshot.json`／`production_readonly_snapshot.json`。資格情報・ユーザー資産・個人データは含まない。

## 候補の内容

`10_candidate.sql`は次の既存ソースを単一トランザクションに合成し、末尾に最新Previewの関数定義と権限を組み込む。

1. `scripts/billing/preview_schema.sql`の課金基盤
2. `20260913105839_billing_paid_pack_lots.sql`
3. `20260913111028_billing_checkout_mode_contract.sql`
4. `20260913120945_billing_dia_approved_contract.sql`

Preview限定の原本をProductionへ直接実行する手順ではない。原本は変更せず、Production専用guardとpostflightを持つ別候補として準備した。
途中にある旧商品値・旧sandbox関数は同一トランザクション内で最終状態へ更新され、部分commitされない。最終商品20件と関数12件は取得時点のPreviewと完全一致を検査する。

追加：billing_products / billing_orders / billing_grants / billing_shop_receipts / billing_asset_lots、課金12関数、資産ロット4 trigger。
共有のPresent受取関数は上書きしない。usersのCASH/DIA、user_itemsのquantity、presentsの受取statusにtriggerを追加するため、適用後の既存受取・資産消費の回帰確認は必要。

## 再適用・干渉

- Previewで適用済みの基盤履歴は`20260911132848`、paid lotsは`20260913114209`、modeは`20260913114321`、DIAは`20260913123800`。ローカルのファイル名時刻と実履歴は一部異なる。
- Previewへ本候補を適用しない。既適用4段階の再適用は不要。
- ガチャ`billing_special_payment_boundary`および`special_gacha_pity_per_banner`は別作業。確率・Pool・価格・天井・公開状態を本候補では変更しない。
- `billing_validate_special_payment()`と`billing_special_payment_guard`は意図的に除外。
- 本番側にbilling名のtable/functionが1つでも存在した場合は中止する。別スレッドが先にガチャbilling guard等を適用した場合も自動的に続行せず、新しい差分へ組み直す。
- 取得時点の後続変更を取り逃さないため、実行直前に再度preflightとPreview定義照合を行う。
- Migration履歴へ旧Preview履歴を偽装挿入しない。本番実適用時の正式履歴は親の適用工程で記録する。

## 実行順序（本番適用は別承認）

1. 接続ツールのproject ID、または直接接続DSNのhost/userからProduction refを確認。秘密値を出力しない。
2. `00_preflight.sql`を実行し、maintenance継続・billing未存在・共有関数hash一致を確認。
3. 実行セッションで`SET app.billing_target_project='ktpolnkyyfkowxdmijww'`を設定後、`10_candidate.sql`を実行する。**この設定値は実行者の確認表明であり、接続先を自動証明するものではない。** 正しいproject IDを持つ接続であることは手順1で別に保証する。
4. 同一transaction内postflightが通過した場合だけcommit。失敗時はROLLBACKし、自動再実行しない。
5. `20_postflight.sql`で空の注文・配送・ロット、共有関数、課金関数、RLS、maintenanceを再確認。
6. 親のコード・環境・本人限定検証経路の工程と合わせて、実購入前の疎通確認へ進む。

販売OPEN、Productionコード配信、Stripe設定、本人限定権限、Season、Ranking、お知らせ、メンテナンス解除は含まない。DB候補の適用だけで購入試験可能とはならない。

## ローカル検証

```sh
python scripts/billing/production-preparation/generate_bundle.py
PGLITE_MODULE=/path/to/pglite/dist/index.js node scripts/billing/production-preparation/verify_bundle.mjs
```

実施済みPASS：接続先確認表明なし拒否、全SQL構文・依存構築、最終5テーブル列定義とPreview一致、商品20件一致、関数12件MD5一致、共有Present4関数保持、RLS、再適用拒否、live注文にtest session拒否、live形式session配送・再送追加付与なし、ビギナー購入上限、maintenance/PAYMENT保持。

ローカルの`cs_live_localfixture`は文字列fixture。Stripeへ接続も実課金もしていない。
**未検証**：Production上でのDDL実行、Production実購入/Webhook/Present受取、実環境のmaintenance本人例外、実接続同時競合。PGliteは実DBでの試験の代替PASSにはしない。

## 戻し方

commit前のエラーは同一transactionのROLLBACK。課金データが作られた後にテーブルをDROPする逆SQLは用意しない。
commit後に問題があれば新規購入を停止しmaintenanceを維持、既存注文・Webhook・配送記録を保全して修正する。コードだけ旧版へ戻す場合も支払済み注文の配送経路を失わないことを確認する。

Preview誤付与テストデータ整理はリリースGATE外。PvP初回finalize実競合試験は未準備のまま、PASS扱いしない。
