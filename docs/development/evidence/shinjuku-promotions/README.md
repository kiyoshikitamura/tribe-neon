# 新宿クリア後プロモーション

## 基準・範囲
基準main / 本番SHA: `eee57d862aaedfa5c5d405b03b7ee41367703a25`。
既存チュートリアル・クエスト・レイドは保持。Productionの変更なし。
Preview DB: `sufvuqdnqohpfzkwxohq`。

## 素材
全画像 860×1292px WebP。画像全体を object-fit:contain、最大270px/44dvhで表示。

|画像|キャラクター|元素材|
|---|---|---|
|public/promotion/beginner_pack_keyvisual.webp|レイジ、アゲハ、ゴウ、カレン、カエデ|public/characters/{reiji,ageha,go,karen,kaede}_transparent_asset.png|
|public/promotion/tribe_join_keyvisual.webp|ルイ、チャン、レオン、サクラ、アリス|public/characters/{rui,chang,leon,sakura,alice}_transparent_asset.png|

100円パックの5人はSetupView.tsxのWORLD_STAGES。TRIBEの5人はPRODUCTION_CHARACTER_RARITIESで全員SSR、重複なし。
画像生成は内蔵画像生成を使用。元キャラ画像5枚ずつを参照し、現代東京の夜景、5人の集合、黒・白・金・赤の大文字で指定文言を配置。価格の概数・税込・券3種・1回限定を指定し、ボタン・確定獲得表現は除外。生成後は指定サイズのWebPに正規化。

## 実装
- 正規判定: user_quest_first_clears.quest_id=q_shinjuku_3。
- 購入除外: user_shop_purchases / beginner_pack_01 / purchase_count>0。
- 加入除外: guild_membersおよびusers.guild_id。
- user_promotion_presentationsとpromotion_dialog RPCを独立追加。
- JST日付はサーバー側算出。ユーザー単位の一時予約と一意制約で端末間の重複を抑止。
- 画像デコード・描画後にviewed_atを記録。30秒で画像失敗表示、閉じる操作は常時可能。
- 初回チェック・既存ダイアログ終了待ち。同一Home滞在中は1回のみ。
- 既存ショップ・ギルドへのnavigateTabを使用。

## 計測
`viewed_at`が表示、`action=primary_cta/later`と`action_at`が操作。未表示の予約は表示数に含めない。
user_idと時刻でbilling_orders（product_id、granted_at）、guild_members（joined_at）、guilds（leader_id、created_at）を結合して表示後の購入・加入・設立を確認可能。現在の所属を参照するため、脱退後の過去加入を完全に分析するには既存の加入履歴が必要。

## DB検証
同梱db-rollback-test.sqlをPreviewで実行、11項目すべてPASS、検証データはROLLBACK。
未クリア、既存クリア者、優先順位、別端末予約、画像失敗後再試行、同一滞在抑止、次回TRIBE、日次抑止、二重記録、翌JST日、加入・購入済みを確認。
実際に2台のスマートフォンを同時操作した検証ではなく、異なるvisit IDによるRPC検証。

## 表示確認
Preview限定の /qa/promotions は実コンポーネントとインメモリ通信を使用。ユーザー登録・課金・所属変更を行わない。
型チェック・最適化ビルドPASS。ローカルビルドは明示的なMock設定を使用。
実機確認・実決済は未実施。

Preview配信: https://tribe-neon-h8h4aybs7-kiyoshi-kitamura.vercel.app （初回候補）
配信済みJavaScriptからPreview DB refがsufvuqdnqohpfzkwxohqであることを確認。
画像2枚とQAページのHTTP配信を確認。

## ブラウザ確認結果
代替ChromiumをGPUなしで起動し、同一実行環境のローカル最適化ビルド /qa/promotions に接続。
390×844で画像247×371、元画像860×1292、object-fit:containを確認。
パック表示→あとで→同一滞在中再表示なし→クエスト→Home→TRIBE表示→TRIBEへ→guildの遷移を確認。
view/later/view/primary_ctaが各1回、ページエラー0。
320×568で画像通信を失敗させ、閉じる操作と未表示扱いを確認。
通信はQAのインメモリRPC。実DBは別途11項目のRPC試験を実施。実ユーザーでの一連のE2E・複数実機・全既存通知との組合せ試験は未実施。
ブラウザ環境には日本語システムフォントがなく、画像外の日本語は豆腐表示。画像内の日本語は確認可能。通常のスマートフォンでの補足文の字体・可読性は未確認。
