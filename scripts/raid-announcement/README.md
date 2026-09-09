# Raid告知・公開手順

2026-09-10変更: バナーはユーザー指示により完全に対象外。画像・バナーDB・MyPage・rotationは変更しない。

基準SHA: `8c0fa6b2131faaed7b63e172ac12424d3fe8f6be`。
作業branch: `codex/raid-announcement-20260910`。
Raid担当スレッド: `01a08683-a33e-7523-b19f-8f0f32ec087f`。
同スレッドの作業ディレクトリ・固定Bundle・Preview・Productionは変更していない。

## 差分

- `config/raid_release_announcement_20260909.json`: 起票本文を改行も含めプレーンテキストで保持。`publish_at:null` は時刻未確定を示す。
- `20260909163114_release_news_foundation.sql`: 本番にない既存news契約を復旧。Publishedフラグ、公開期間、公開済みSELECTだけのRLS、release_key一意制約。DB分類 **REQUIRES_MIGRATION**。
- `InboxPanel`: 開く際の一覧再取得と、小型Mobileで下部「閉じる」を保持するCSS。既存created_at降順を維持。
- `release.mjs`: 公開SQLの生成のみ。接続・送信しない。固定イベントキーのトランザクションロック、固定UUID/PK、既存内容照合を使用。
- 告知とGLOBAL System投稿は同一トランザクション。User投稿RPCは使わない。Systemはuser_id/author_id/target_idがNULL。既存KPI・チャット仕様は変更しない。
- 再実行は時刻や送信済み通知を変更せず、手動非公開も尊重。通知行は送信済みレシートのため削除しない。誤削除した場合、再実行前に記録を復元・照合する。

## 検証済み

- 隔離PGlite PostgreSQLで実SQLを実行: 本文全文一致、1件送信、未来日時拒否、通知失敗時の全体rollback、再実行、公開日時保持、非公開保持、内容競合拒否。
- anon/authenticatedの公開期間RLSと直接INSERT/UPDATE拒否。
- 候補の実 `on_kpi_v249_guild_chat_message` 定義を変更せず使用し、GLOBAL/Systemが事実テーブル書込みへ進まないことを確認。
- 実InboxPanel/CSSを、データ/ContextだけfixtureにしてChromium 1280×900、WebKit 390×844、320×568で一覧→詳細、本文一致、改行、スクロール、footer表示、閉じる→再取得を確認。
- Typecheck、Mock build PASS。対象ESLint error 0（既存any/imgのwarningあり）。
- スクリーンショット: `scratch/announcement-ui/`。小画面のfooter押出しを発見して今回のnews限定CSSで修正。

これは実Auth/Realtime/ProductionのAcceptanceや複数接続同時送信の実験ではない。Raid・既存バナーのアプリ全体回帰を実施したという意味でもない。該当ファイルは基準SHAと不変。

## 再現

```powershell
npm ci --no-audit --no-fund
npm install --prefix scratch/announcement-test-runtime --no-audit --no-fund @electric-sql/pglite@0.3.14 esbuild@0.25.12
npx playwright install chromium webkit
node scripts/raid-announcement/verify.mjs
node scripts/raid-announcement/verify-ui.mjs
npm run typecheck
```

テストruntimeはscratch内に隔離。アプリ依存やlockfileは変更しない。

## 公開担当が行う手順

1. 告知差分のみを最終Raid候補へ統合し、最終SHAと稼働先を確認する。古いmainやこの検証用Mock buildを公開しない。
2. 接続先を `specs/deployment_guide.md` と既存guardで検証。本番想定は `ktpolnkyyfkowxdmijww`、ゲームURLは `https://www.tribe-neon.com`。実行直前に再確認する。
3. `news` がまだ存在しない場合のみ、上記migrationファイル単独を適用。既に存在する場合は定義/RLS/履歴を照合して再投入しない。`supabase db push`や旧setup一括実行は禁止。newsの追加はRaidの既存固定Bundleとは別の付帯差分。
4. 告知UI差分を含むフロント配信とRaid公開が完了したことを確認する。Raid未公開なら以降は待機。
5. 確認済みRaid公開時刻（タイムゾーン付きISO）でSQLを生成する。

```text
node scripts/raid-announcement/release.mjs <確認済みRaid公開時刻ISO> <未作成の出力SQLパス>
```

6. 出力内容・対象DBをレビューして、権限のある運営接続で一回実行。タイムアウトなど不明な結果はまずstatus.sqlで確認し、必要なら同じSQLを再実行。異なるイベントキー/UUIDに変更しない。
7. `status.sql` と通常プレイヤーの画面でPublished/本文全文/日時/一覧→詳細、GLOBAL通知1件、System表示、返信操作なしを確認。既存Social Active/KPI集計の除外も本番readbackで再確認する。

## 運営

非公開: `UPDATE public.news SET is_published=false WHERE release_key='raid_release_announcement_20260909';`

再公開: 同じ行のis_published=true。通知SQLの再実行では再公開しない。公開期間を変更する場合はstart_at/end_atを運営が明示更新する。送信済み通知は増やさない。

一覧を開き直すと更新される。開いたままの詳細をリアルタイムで撤回する仕組みは今回追加していない。

送信済み確認: `status.sql`。新しいCMSは作らず、権限のあるDB運営手段を使用する。

本番migration・フロント統合配信・告知公開・通知送信は未実行。Raid公開待ちであり、本番DONEは未達。
