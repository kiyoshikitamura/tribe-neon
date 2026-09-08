# KPI DAU / MAU・保存済み集計（2026-09-08）

通常一覧の閲覧ごとに行っていた集計を、DBの定期処理による保存と、その結果の読み取りに変更した。先行リリース `69e385e` の日次・月次切替を継承する。

- 日次DAUと月次MAUは `kpi_daily_user_activity` の期間内distinct subject。JST暦日／暦月、既存の分類除外を維持し、MAUはDAUの合計にしない。
- 保存先は新規 `kpi_overview_saved_results`。当月を含む12か月と、その範囲の日次を保存。Tutorial UNION・Guild・Chat・D1-D5の既存コホート定義を維持する。
- pg_cronで毎時07分・37分に更新。重複実行はadvisory lockで抑止し、120秒でタイムアウト。単一statementで全行を更新するため失敗時は直前の結果が残る。
- 通常の日次／月次APIは保存テーブルへのSELECTだけを行い、サーバーキャッシュは60秒。キャッシュミス時のDB読取は残るが、生データ集計や更新を画面アクセスから起動しない。Basic認証とHTTP no-storeは維持する。
- 最終集計日時を表示。90分超の遅延や欠落期間を明示し、未集計や取得エラーをゼロで埋めない。
- 日次詳細・V2・Legacyの診断用APIは従来の処理を維持する。Formal Open・GameplayのAuthorityは変更しない。
- 月次累計登録は既存除外適用後の月末までの登録subject（当月は集計時点）。月次Active / Effective Active Guildは、その月に1日以上既存の日次条件を満たしたdistinct guildとし、画面にも定義を表示する。
- 課金列は既存Authorityが未定義、またはPAYMENT CLOSEDのため「—」と理由を表示。売上・課金人数を推測しない。
- 新規保存テーブルはRLS有効。service_roleはSELECTのみ、anon/authenticatedはアクセス不可。集計関数の実行権限はDB管理者に限定する。

## 検証

- Previewに追加migrationを適用し、355行を初期集計。既存APIと12か月の新規・Tutorial・Guild・Chat・D1-D5分母分子が一致。
- rollback付きSQLテスト：閏日・JST月境界、古い登録者の活動、QA除外、DAU合計4に対してMAU3、テーブル／関数権限。
- 保存テーブル専用reader契約テスト、TypeScript、build、ESLint、既存Formal Open/M2/固定ドメイン契約テスト。
- Playwright 8件：390/412px・PC、DAU/MAU列、横スクロール、月次→日次→詳細、V2/Legacy、取得エラー、未集計と更新遅延。
- Previewの初期データ量で更新処理約169ms（Productionの性能保証値ではない）。

## 運用

適用SQL: `supabase/migrations/20260908041026_kpi_overview_saved_results.sql`。MCPが採番したPreview migration history versionは `20260908041511`。既存データのbackfillや既存snapshotの書き換えは行わず、新規投影のみ初期作成する。

Preview確認後にProduction DBへ同じ追加SQLと初期集計を適用し、KPI専用本番ブランチをfast-forwardする。既存運用どおりVercel Preview targetを使用し、ゲーム本体のProduction targetは操作しない。
