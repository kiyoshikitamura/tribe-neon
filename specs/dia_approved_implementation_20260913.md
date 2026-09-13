# DIA承認仕様 実装・受入記録

2026-09-13承認。環境再作成後、remote `1a9e3fc` から以前の `676ef6e` / `1e62cf0` と同仕様を復旧。旧ローカルcommit自体は消失したため復旧commitを採用する。

## 承認内容

|税込円|有償DIA|無償DIA|
|---:|---:|---:|
|300|300|0|
|500|500|0|
|1,000|1,000|30|
|2,000|2,000|80|
|5,000|5,000|240|
|10,000|10,000|680|

有償は付与から120日。無償は無期限。Present受取で期限を延長しない。既存無償DIA・CASH・アイテムへ遡及しない。
有償DIAから交換したCASH・回復アイテムは元の期限を引継ぐ。AP/BP/RPへの使用で資産は消費済みとなり、回復済みポイントに期限を持ち込まない。

## 実装

`20260913120945_billing_dia_approved_contract.sql` は前回Supabase CLIで生成し未適用だったファイルを復旧。過去に適用済みのSQLは変更しない。DB実適用・配信は親工程。

- 6商品を有償／無償の別Presentへ配送。有償部分のみ既存billing_asset_lotsへ登録。
- neon_diamondsの減少・失効を共通lot triggerへ接続。Special等の既存消費も期限近い購入分から消費。
- 通常ショップはユーザー行ロック→期限反映→消費前ロットsnapshot→共通消費→期限を引継いだPresent／lotを同一transactionで生成。request再送で再消費・再付与しない。
- 交換lotはsource_lot_id、元購入order、発行時刻・期限を保持。
- Checkoutは4pack＋DIA6商品のDB価格・数量・期限内訳一致で利用可能。catalogVersionは20260913へ更新。環境の販売公開設定は変更しない。
- Shop商品と確認画面へ有償／無償数量、購入分期限ビューへ受取済みDIA内訳を表示。交換確認には「有償ダイアで交換した分は、元の有効期限を引き継ぎます。」を表示。
- 4pack価格・数量・生涯回数制限、Normal交換10商品、Special抽選率・Ptを変更しない。

## 整数配分規則

承認済み期限継承を満たす実装規則であり、丸め式をユーザーが個別指定したものではない。
期限の早い消費元から、`ceil(交換数量×累積消費DIA/必要DIA)`の増分を割り当てる。残りは完全無償分。合計は元の数量と一致する。

- 有償25＋無償475で11個：有期限1個＋無期限10個。
- 期限Aの有償25＋期限Bの有償25で1個：Aが早ければ1個にAを付ける。
- 有償150＋無償150でCASH3,000：有期限1,500＋無期限1,500。

複数期限を含む1個は最早期限となる。端数を無料資産に変えて期限回避させず、合計数量を保存する。

## 検証範囲

Typecheck・変更TS/TSX ESLint、verify_dia_approved、verify_paid_lots、verify_reconciliation、verify_shop_release_catalogを復旧候補で再実行しPASS。
PGliteは実migrationと現行Present関数を実行し、6商品の有償／無償・配送再送・有償期限・混合支払・最早期限・無料保持・CASH・回復消費・内部権限を確認する。
Stripe通信・実機UI・Preview DBの適用受入はこの子作業では未実施。法的結論は追加しない。

## 旧通常ショップRPC

前回Preview read-only監査で、`buy_normal_shop_product(uuid,text)`はauthenticated実行可能、呼出先`buy_normal_shop_product_core_20260823(uuid,text)`は`success:true`だけを返すstubだった。DIA消費・付与は存在せず、core直接呼出のauthenticated権限もなし。期限継承の迂回経路ではないため機能復活・権限変更は行わない。今回の復旧はこの判断を維持する。
