# 本番移行の配信経路・PC最終操作（2026-09-15）

## 方針

ユーザーはスペシャルガチャ実機確認完了を報告し、受入済みPreview＋必要DB差分の本番移行を承認した。
GitHub → Vercel の既存Git連携を主経路とする。本番ソース44e43eeの回収は終了し、旧ソースへのUIパッチだけの配信は行わない。
一般メンテナンスを維持し、期限付き許可済み本人によるチュートリアルからの検証を目指す。メンテナンス解除・実購入はこの文書の操作には含めない。

## 21:18 JST時点のREAD ONLY確認

| 項目 | 結果 |
|---|---|
| Vercel project | tribe-neon / prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb |
| Vercel team | kiyoshi-kitamura / team_ounFOJd7sfCvcytYCkExbj77 |
| Production | 44e43ee43c358b3bbe0b5dce64e538453581ba36 |
| Production deployment | dpl_6SxzqHvirUdJ1m1iP3s1jiQBqHLs / READY |
| Production domains | www.tribe-neon.com / tribe-neon.com / tirbe-neon.vercel.app |
| 既存Git連携 | 最新handoffブランチ452b0f6がsource=git、READY。接続は機能している |
| productionBranch | 未確定。get_projectが返す項目に含まれない |
| Production envキー有無 | 未確認。現在の接続ツールにenv一覧／汎用API機能なし |
| Production billing config | HTTP 200、available:false。キー不足だけが原因とは断定不可 |
| Cloud CLI | vercelコマンドなし、標準CLI認証ファイルなし、VERCEL_TOKENなし |

Vercel get_project/get_deploymentは成功。403は今回発生していない。
現在のProduction deploymentにあるgitCommitRef=codex/activity-banner-production-20260914は、プロジェクトのproductionBranch設定を示す証拠ではない。

## 親スレッドで先に完了させること

1. ガチャ3ade18e、本人限定アクセス6d4e296/1986518、最新修正を含む最終候補の**完全SHA**を固定する。
2. 全Production DB差分をレビュー・適用・読み戻し確認する。Preview適用済み20260915113959_special_gacha_pity_per_bannerをProductionにも適用済みとみなさない。既適用のProduction本人限定アクセスMigrationは再適用しない。
3. メンテナンスガードとテストユーザーの期限を確認する。本人許可の期限切れは別途更新を完了させる。
4. 候補ソースとProduction DBの互換性、Activity/Bannerの必要挙動を確認する。
5. 本文の最終候補SHA・DB完了証跡をPCへ渡す。PCに全Migration再実行を依頼しない。

## PC Codexへの最小依頼

既存CLIログインを使い、まずVercel ProjectのGit接続から実際のproductionBranchとGitHub repositoryを確認する。Production envのキー名・設定有無・期待値との一致だけを出力する。秘密値は表示しない。

確認対象：

| キー | Productionでの期待 |
|---|---|
| NEXT_PUBLIC_APP_ENV | production |
| NEXT_PUBLIC_SUPABASE_URL | https://api.tribe-neon.com または https://ktpolnkyyfkowxdmijww.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Production用。値非表示 |
| SUPABASE_SERVICE_ROLE_KEY | Production用。値非表示 |
| NEXT_PUBLIC_GOOGLE_CLIENT_ID | 既存の承認済み値と一致 |
| NEXT_PUBLIC_RAID_ROOM_UI_ENABLED | 受入候補のRoom UIを使用するためtrueを確認 |
| NEXT_PUBLIC_USE_MOCK_DB | trueでない |
| BILLING_MODE | live |
| BILLING_LIVE_ENABLED | true |
| BILLING_RETURN_ORIGIN | https://www.tribe-neon.com |
| STRIPE_SECRET_KEY | live用キー。値非表示、test用をコピーしない |
| STRIPE_WEBHOOK_SECRET | Productionのlive Webhook用。値非表示 |

Stripe live Webhookの宛先は https://www.tribe-neon.com/api/billing/webhook 。既存登録を確認して重複登録しない。キー等が不足している場合、PCの既存秘密情報から正規設定できる項目を設定し、取得できない項目だけを報告する。Preview値の一括コピーは禁止。

Git操作は、親が固定した最終候補を実際のproductionBranchに統合する。mainと決めつけず、force pushしない。統合で別SHAになる場合は最終treeの一致・必要差分を検証して、その完全SHAを配信対象として記録する。DB完了確認後に1回だけpushし、既存Git連携でProductionビルドを開始する。

**Previewビルド済み成果物のpromoteは使わない。** NEXT_PUBLIC_*にPreview接続先が組み込まれている可能性があるため、Production環境で新規ビルドする。ProductionBranch変更、CLI直配信への切替が必要なら、その理由と対象を親へ戻す。

## 配信後に確認・報告する項目

- Gitの配信SHAとVercelのSHAが一致、target=production、READY。
- www/apexのaliasが新Productionを指す。
- 実ブラウザの接続先がProduction project ref。Previewへの接続がない。
- 一般ユーザーはメンテナンス表示・更新拒否を維持する。
- izasama39@gmail.comはGoogle認証から本人限定でチュートリアルへ進める。
- /api/billing/config が available:true / mode:live。これは販売OPENや実購入PASSを意味しない。
- 課金本番検証は本人の購入操作から別途進める。Webhook、Present、履歴の照合を実施してから完了判定する。

旧Production deployment IDはコードを戻すための参照として保存するが、DB前進後の互換性確認なくrollbackしない。
本調査担当はコード変更・DB書込・env変更・branch更新・Deployを実施していない。


## 本番DB確定適用済み（21:28 JST追記）

以下はProduction ktpolnkyyfkowxdmijwwに適用済み。PC側で再適用しない。

- 20260915115637_operations_maintenance_test_access
- 20260915121836_formal_open_billing_foundation_and_paid_contract
- 20260915122654_operations_maintenance_google_tutorial
- 20260915122749_formal_open_gameplay_gacha_growth_integration

最後の統合Migrationはmanifest.jsonの35段（Special Gacha天井分離を含む）を収録。
Previewの20260915113959_special_gacha_pity_per_bannerを別途Productionへ重ねて適用しない。
既存資産の指定列、feature_operating_states全行、ranking_seasons全行のfingerprintをトランザクション前後で比較し一致。35段をROLLBACKでリハーサル後、同じ検査をCOMMIT時にも実施してPASS。
9つの主要関数はPreviewとLF正規化した定義hashが一致。注文・配送記録0件。
進行中86patrolの旧CASH設定はsnapshotとして保存。旧シーズン終了・新シーズン開始・ランキング報酬付与は未実行。

実行記録用SQLは00_preservation_prefix.sql + 10_gameplay_candidate.sql + 90_preservation_rollback_suffix.sql。確定適用時は最後のROLLBACKをCOMMITに、結果ラベルをPASS_COMMIT_PRESERVATIONに変更した。これらは証跡であり再実行指示ではない。

本人限定許可は22:56:56 JSTまで。配信が遅れて期限を過ぎた場合は勝手に恒久化せず親スレッドへ知らせる。
SHOP/PAYMENT/SPECIAL_GACHAの本番公開状態は変更していない。配信後、親スレッドでメンテナンス維持と本人限定サーバーガードを再確認してから販売・ガチャの状態を調整する。

PC配信対象はこの追記とGoogleチュートリアル対応を含む統合候補。親スレッドが提示する完全SHAを固定して取得し、既存Productionブランチの追加変更を確認して統合する。旧44e43ee相当のソース探索は再開不要。

PvP初回finalizeの実競合観測・二重付与・BP/RATE/Ranking検証は未確定（PASS不可）。Preview誤付与テストデータ整理はリリースGATE外。
