# ホスティング・ドメイン公開前チェックリスト

更新日: 2026-09-02

## 目的と安全境界

本書はProduction公開前のVercel、ドメイン、Supabase Auth、Google OAuthの確認手順である。正式hostname、外部サービスの設定値、権限、最終素材を推測して補完しない。

- 固定Preview alias `https://tribe-neon-mobile-preview.vercel.app` をProduction deploymentへ向けない。
- PreviewへProduction Supabaseの認証情報を設定しない。
- Production、DNS、OAuth、Supabase Dashboardの変更は、変更対象とrollbackを提示して明示承認を得た後に行う。
- DB migration、Production deployment、domain切替を同時に行わず、各境界でSmoke結果を固定する。

## 公開前robots方針

既定値は検索index禁止とする。

```text
SITE_ORIGIN=
RELEASE_INDEXING_ENABLED=false
```

`SITE_ORIGIN`は承認済みのHTTPS originだけを設定する。path、query、fragmentは設定しない。`RELEASE_INDEXING_ENABLED=true`だけではindexを有効化できず、有効な`SITE_ORIGIN`も必要となる。

index解禁条件は以下の全項目のPASSである。

- 正式hostnameとapex/wwwの正規URLが承認済み
- リーガルページの本文、リンク、運営者表記が承認済み
- 最終favicon、OG画像、ロゴが承認済み
- Production OAuth往復、主要Smoke、実機確認がPASS
- 公開対象外のQA route、テストデータ、仮素材が露出していない
- metadata、canonical、OGPの実値が正式hostnameと一致

条件成立後、Production環境だけで`SITE_ORIGIN`と`RELEASE_INDEXING_ENABLED=true`を設定し、再deployしてHTML robots、`/robots.txt`、`/sitemap.xml`を確認する。

## Vercel Production

- [ ] 対象Vercel projectとGitHub repository `kiyoshikitamura/tribe-neon`の対応を確認
- [ ] Production branchとrelease candidate SHAを記録
- [ ] 正式hostnameを確認。`tirbe-neon.vercel.app`表記が意図した既存slugか誤記かを所有者に確認
- [ ] `NEXT_PUBLIC_SUPABASE_URL`がProduction ref `ktpolnkyyfkowxdmijww`を指す
- [ ] Production anon keyをProduction scopeだけに設定
- [ ] `NEXT_PUBLIC_APP_ENV=production`
- [ ] `NEXT_PUBLIC_USE_MOCK_DB=false`
- [ ] `NEXT_PUBLIC_ENABLE_QA_TOOLS=false`
- [ ] `SITE_ORIGIN`を承認済み正式originに設定
- [ ] 公開承認までは`RELEASE_INDEXING_ENABLED=false`
- [ ] `SUPABASE_TEST_EMAIL`と`SUPABASE_TEST_PASSWORD`をProduction/Previewへ設定しない
- [ ] 一意のdeployment URLでBuildとSmokeを完了してからdomainを切り替える

## Supabase Auth / Google OAuth

- [ ] Production Supabase refが`ktpolnkyyfkowxdmijww`であることをguardで確認
- [ ] Google OAuth clientはProduction専用の値を使用
- [ ] Google Cloudの承認済みredirect URIに`https://ktpolnkyyfkowxdmijww.supabase.co/auth/v1/callback`を登録
- [ ] Supabase Site URLを承認済み正式originに設定
- [ ] Supabase redirect allow-listに`${SITE_ORIGIN}/**`を登録
- [ ] 匿名sign-inとmanual linkingの設定を確認
- [ ] OAuth開始前後で同一ゲームアカウントUUIDが維持されることを確認
- [ ] OAuthキャンセル、既存identity衝突、ログアウト後再ログインを確認
- [ ] client secretをリポジトリ、チャット、Vercel public envへ保存しない

アプリは実行中のoriginから`/auth/callback`を生成する。アプリコードへProduction hostnameをハードコードしない。

## DNS / SSL

- [ ] ドメイン所有者、レジストラ、DNS provider、変更担当者を確認
- [ ] apex/wwwのどちらをcanonicalにするか承認
- [ ] 現行DNS record、TTL、CAAを変更前に保存
- [ ] Vercelが提示したrecordだけを設定し、値を推測しない
- [ ] 切替前にTTLを低減し、反映に必要な時間を確保
- [ ] Vercel上でdomain verificationとSSL certificateが有効になったことを確認
- [ ] HTTPからHTTPS、非canonical hostnameからcanonical hostnameへのredirectを確認
- [ ] iOS Safari、Android Chrome、PC ChromeでHTTPSとOAuthを確認

## Metadata / 公開ファイル

- [ ] `/favicon.ico`の最終承認
- [ ] Web App Manifestの名称、icon、起動表示を実機確認
- [ ] 最終OG画像受領後にOpen Graph/Twitter metadataを設定
- [ ] 正式origin確定後にmetadataBaseとcanonicalを確認
- [ ] `/robots.txt`が公開承認前は`Disallow: /`であることを確認
- [ ] 公開承認後だけ`/robots.txt`と`/sitemap.xml`が正式originを返すことを確認

現行`public/branding/tribe-neon-logo.png`は1536x1024の非正方形画像であり、manifest iconには使用しない。`src/app/favicon.ico`は16、32、48、256pxの正方形を内包するため、最終承認まで既存manifest iconとしてのみ使用する。

## 切替順序

1. Release candidate SHA、Production env、rollback対象deploymentを固定する。
2. domain未接続の一意Production deployment URLでSmokeを行う。
3. Supabase AuthとGoogle OAuthの候補値を相互確認する。
4. Vercelへdomainを追加し、Vercelが提示したDNS recordを設定する。
5. SSL有効化後、Supabase Site URL/allow-listを更新する。
6. OAuth往復と主要Smokeを行う。
7. リーガル、最終素材、実機確認の承認後に検索indexを解禁する。

## Rollback

変更前に以下を記録する。

- 直前の正常deployment ID / URL / commit SHA
- 旧DNS recordとTTL
- 旧Supabase Site URLとredirect allow-list
- 旧Google OAuth redirect URI一覧
- 旧Vercel Production環境変数の値とscope

異常時は新規変更を止め、次の順で復旧する。

1. 検索indexを無効化する。
2. Vercelで直前の正常deploymentを再promoteする。
3. 必要な場合だけ保存済み旧DNS recordへ戻す。
4. Supabase Site URL/allow-listとGoogle OAuth redirectを保存済み旧値へ戻す。
5. DNS/SSL/Authの反映後にSmokeを再実行する。

DB rollbackはホスティングrollbackと分離し、対象migration固有の承認済み手順だけで行う。
