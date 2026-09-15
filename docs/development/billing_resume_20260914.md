# 課金診断再開結果

2026-09-14 / 最新コード照合基準 `ed215459dc1b895fe94b17fd28d66c991a3ba0d6`

## 結果

- ローカルNode実行は復旧。Node v24.19.0。
- ただし、配信環境の実.env、Vercel CLI認証、Vercel project link、関連プロセス環境変数は存在しない。ローカル復旧だけでは配信設定診断を再開できない。
- 既知Vercel403は繰り返していない。秘密値出力、キー発行、設定変更、DB変更、決済、配信を実施していない。
- 最新GitHub statusの Vercel – tribe-neon は success。Deployment dashboard: https://vercel.com/kiyoshi-kitamura/tribe-neon/8djf7U3Wdc6HobQz9wfGvxZht7v4 。固定Preview originはこの結果から取得できない。
- `available:false` の具体原因は依然未特定。最新config routeは環境検証例外・ServiceRole照会失敗・catalog不一致を同じfalseへ集約する。
- 前回のPreview20商品一致結果は継承し、今回再照合していない。管理接続の商品一致は、配信APIのServiceRole接続成功を証明しない。

## 実行できた検証

ローカルcheckoutは旧d49だが、下記7ファイルのGit blob SHAを最新ed215459と照合し一致を確認してから既存テストを実行。

- contracts.ts: cdc19926f841204fba69ea01127fc377e5790c74
- api/billing/config/route.ts: 4115ae00f755156a458bd7d227a2dc0c12a5307d
- reconciliation.ts: 9da50f0af3808c5a68c5a330e8d409bac2eba249
- catalog.ts: 999de025e6815ca5298b94e893cf23ce75545b1a
- verify_contracts.mjs: 437002228a4ddb238a96a90d5256e08cd26611a5
- verify_modes.mjs: 208409c1e47be4f4ce0ba7f077c57b23ae528017
- verify_reconciliation.mjs: efa7e715bbf1e7b6da06244a00b3f95db178c792

3スクリプトすべてPASS。Sandbox/live混在拒否、署名改ざん、価格/通貨/注文/所有者照合、配送/期限競合、古いイベントによるGRANTED降格防止を確認。

これはローカルfixtureテストであり、Stripe実接続・Webhook実配送・決済E2E成功とは扱わない。

## 次に必要な1操作

既存Vercel Preview設定を読み取れる環境で、既存診断器を実行する。

`node scripts/billing/check_sandbox_environment.mjs --remote-catalog`

秘密値は出力せずchecksとcatalog_http/catalog_matchesのみ返す。配信環境を読み取れる接続、またはその環境での上記結果があれば、falseとなった条件のみ修正できる。キーのチャット貼付・全設定の再作成は不要。

対象は専用Preview、Supabase `sufvuqdnqohpfzkwxohq`。設定修正後は新Previewのbilling/configでavailable:trueを確認し、既存Sandbox受入手順へ進む。

## Gate

売上KPI集計は公開後残件。課金Gateは決済/付与/重複防止/照合可能な記録の実接続検証。現時点で課金GateをPASSとはしない。
