# Production 公開結果

2026-09-10 02:56 JSTに公開切替完了。
https://www.tribe-neon.com/

配信source: c844534f5ce160fb3e713a58aed8377190aaa209
Deployment: dpl_D6u4GxSvENg9HxG7V9G1S2tXwuRw
固定配信URL: https://tribe-neon-1aa9j6nn9-kiyoshi-kitamura.vercel.app
承認公開Bundle: f2ff4bcd のbundle-manifest.json。製品コードは基準c844から変更なし。

## 実施と確認

- DB 00/01/02/04/06/07を単一transactionで適用。実定義で新Room/Profile未存在を確認しており、適用済みSQL再投入なし。
- Edge resolve-battle v2を5ファイル完全一致、verify_jwt=trueで確認。旧/新経路の互換版。
- 03で期限Cronを毎分登録。実daemon succeeded。既存6Cronは保持。
- 新規Production build READY。Mock/QAをfalse、Room UIをtrue、APP_ENV productionに指定。公開API originと配信publishable keyをProduction管理値と比較し、実Auth設定読取HTTP200。既存キーはJWT形式ではなくpublishable形式だったため、JWT-only検査を管理値の一致検査へ修正。秘密値は記録していない。
- 08承認報酬設定、09新受付ON/旧受付OFFを適用。28profile/140memberのJSONがc844と完全一致。
- 初級は総合力下限なし、中級160,000、上級200,000、超級240,000。既存のLv5参加条件を保持。
- 2026-09-10 JSTの日次2エリアは池袋・六本木。
- 既存対象外380関数とACL、KPI2関数、旧boss行hashを保持。報酬台帳の(room,user)/(room,user,item)主キーとPresent一意制約を確認。
- www HTTP200で新Deploymentを確認。apexはwwwへの308を保持。最終alias差分はゲーム2ドメインだけ。KPI含む残り73割当は不変。

## 配信時の例外と復旧

CLI --prod --skip-domainでも共有標準URL tribe-neon-kiyoshi-kitamura.vercel.app の自動割当が発生した。検出後、直前の dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx へ当該1aliasだけ戻し、75割当一致を確認してからゲーム2ドメインを明示切替した。Vercel Deploymentのalias配列は過去の自動割当を残すため、実alias一覧をAuthorityとして照合した。KPI/www/apexの意図しない自動切替は発生していない。
準備済み受付停止手順は隔離PGでPASS。今回のゲーム本番切替後に製品障害は検出しておらず、受付停止/資産巻戻しは実施していない。

## 実測と残件の区別

本番では実ユーザーの挑戦→参加/救援→戦闘→Result→帰還→報酬受取をまだ実行していない。開いた本番ブラウザがチュートリアル途中の匿名セッションだったため、ユーザーへLv5以上の確認用アカウントを依頼したところ「本番は別アカウントで実行します」と回答された。したがってこの項目はユーザー側本番確認待ちであり、全smoke PASSと記録しない。公開直後の新Room数0、Room PENDING0。

同一c844 Previewの7戦/初級討伐/救援2戦/4Present受取/再送重複拒否は7c5950ff証跡を引継ぐ。本番の重複防止は定義と制約一致確認であり、本番で二重受取要求を実行したという意味ではない。公開HP短縮、QAユーザーseed、RP補充、合成戦闘結果の投入はしていない。属性×2/Guild×2も追加有効化なし。

Character統合受入は固定Previewへの問いにユーザー「問題ありません」を受領済み。メール認証処理は変更せず既存受入引継ぎ。

告知担当へ公開SHA/URL/本番技術確認/実戦未受領を送付。告知Published/System通知1件/バナーは実戦確認結果待ちとして、こちらでは一切実行しない。告知担当から後続61571d3のバナー追加（オミット撤回）を受領したが、基準c844の今回配信へ追加統合していない。後続配信はc844を保持して実施し、旧8cへ巻き戻さない旨を引継ぎ済み。
