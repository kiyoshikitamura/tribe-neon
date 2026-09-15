# 本番課金テスト前確認（2026-09-15）

## 現在地

- 本番メンテナンス：20:33:02 JST開始。MAINTENANCE状態を読み戻し、assert_feature_mutation_allowedが55000で拒否することを確認。解除していない。
- Production：44e43ee43c358b3bbe0b5dce64e538453581ba36 / dpl_6SxzqHvirUdJ1m1iP3s1jiQBqHLs / READY。既存Activity・Banner修正の配信を確認。
- 受入済み候補：eb0ca07e26b0fdf0b14f209caaecc7e85c177d97。全ソースの本番同等性は旧監査の限界を維持。
- Production DB：ktpolnkyyfkowxdmijww。Preview DB：sufvuqdnqohpfzkwxohq。
- 本番にbilling_products/orders/grants/shop_receipts/asset_lotsの5テーブル、billing_*関数は存在しない。依存するusers/presents/payment_transactions/user_shop_purchases/user_items/user_equipmentsは存在する。
- 本番SHOP/PAYMENT/SPECIAL_GACHAはCLOSED。Previewの3機能はOPEN。
- 今回の事前確認ではProduction永続変更なし。メンテナンス以外の本番反映は別承認。

## 最新受入判断

- Google認証、Stripe帰還、ショップ・Present、クエスト敗北修正、初期実機指摘：本人受入完了。
- Preview誤付与テストデータ整理：後回し。リリースGATEにしない。
- PvP初回finalize実競合：未準備、PASS扱い不可。
- ガチャ：本人確認中。確認を妨げる公開状態変更はしない。

## 今回追加した購入停止チェック

Checkoutとダイヤ購入のAPIに運用状態照会がなく、service_role経由で新規購入できる実装を確認した。
購入処理前にMAINTENANCE=CLOSED、対象PAYMENT/SHOP=OPEN、mutation_allowed=trueを要求する。取得失敗・行欠落も503で拒否する。
履歴、restore、署名Webhookは対象外とし、既に支払った注文の照合・配送を止めない。
ローカルAPI試験では停止時の注文予約・Stripe呼出・消費0、欠損/停止/正常状態、既存Checkout/再送/署名Webhook/restore回帰を確認。
受付判定後に既に進行している要求や作成済みStripe Sessionを取り消す処理ではない。

## 本番へ必要な準備順序

1. 基盤scripts/billing/preview_schema.sqlはPreview限定候補なので、そのまま本番へ流さず正式な本番差分へ整理する。
2. billing_paid_pack_lots → billing_checkout_mode_contract → billing_dia_approved_contractの依存順を確認。Present/有償ロットの共用関数と、Quest/Raid等の後続差分の上書きを照合してから対象を確定する。Migration名・実定義の両方で既適用を除外する。
3. 本番メンテナンス中に本人だけが購入・Present受取まで通れる経路は現状ない。UI全体停止と通常ユーザーDB更新停止があるため、課金有効化前に検証経路を実装・Preview確認する必要がある。メンテナンスを全員に解除して代用しない。
4. Production用BILLING_MODE=live / BILLING_LIVE_ENABLED=true / sk_live_ / live webhook secret / BILLING_RETURN_ORIGIN=https://www.tribe-neon.com を、秘密値を出さず確認・設定。現時点では実設定の有無は未確認。sandboxをProductionへ接続する変更はしない。
5. 承認されたDB差分・アプリ候補を本番へ反映し、一般ユーザーを停止したまま本人が小額実購入→Webhook→Present受取→履歴・内訳を確認する。実購入は別承認。
6. ガチャ確認、正式公開のSeason/ランキング/告知作業を終えてから、別途メンテナンス解除を判断する。

## Season / 告知の注意

現本番には期限超過のACTIVE行（POWER/GVG/RAID）もある。新Season生成や一括終了は未実施。
最新の本人指定お知らせはconfig/formal_release_announcement_20260915.json。新Seasonは「正式オープン翌日から9月30日まで」。古い管理文書の同時開始記載を無条件で採用しない。
既存本番お知らせを置換せず正式オープン記事を追加する。記事の「終了・付与しました」を、実処理完了前に公開しない。
