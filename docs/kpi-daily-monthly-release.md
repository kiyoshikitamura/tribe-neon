# KPI 日次・月次一覧（2026-09-08）

## 基準と変更範囲

- 本番KPI専用ブランチ `codex/kpi-dashboard-production-20260904`、コミット `b08e396e657615afd6dfddc05bbec37d21561a25` を取得して開始。
- Vercel `dpl_FV54jyPbZ6gJjqgQQZ7td16Vjk1v` のSourceと一致を確認。
- `/admin/kpi` に日次／月次切替。PC・モバイル共通で1日／1か月＝1行、日付列・ヘッダー固定、表内の横・縦スクロール。
- 日次の初期表示は直近30日、月次は当月までの12か月。月から当該月の日次一覧へ、日付から既存詳細へ遷移。
- 新規、Tutorial、Guild、Chat、D1〜D5は既存の登録日コホート定義を使用。月次は互いに独立した日次コホートの分母・分子を加算し、率を再計算する。
- 月次D1〜D5は各指標の成熟済みコホートのみ。未成熟・ゼロ分母・読取失敗を0%に置換しない。当月は途中集計と明示。
- 追加APIはGET `/api/admin/kpi/v2/monthly`。既存Basic認証とno-storeを使用。`month=YYYY-MM` は終了月（省略時は当月）。
- 月次で増える読取件数に対応するため、活動・所属・チャットの読取を200ID単位・1000行ページ単位にする。既存の分類除外、Tutorial UNION、成熟判定と人数定義は維持。
- V2、Legacy、日次詳細、既存API URL、Formal Open判定ロジック、Gameplayの変更なし。DB migration・backfill・refreshなし。

## 検証

- TypeScript、最適化ビルド、変更ファイルESLint（エラー0、既存any境界の警告あり）。
- 月次集計：不均等な分母の加重計算、指標別成熟判定、空データ、ゼロ、取得不可、月境界・閏日。
- 既存Tutorial UNION、M2、Formal Open、固定ドメインの契約テスト。
- 1201人のGuild／Chatと6005活動行の取得、および取得失敗を0件扱いしないこと。
- Playwright 7件：390/412px・PC、日次詳細、月次切替、月から日次、V2／Legacy、エラー再試行・空表示。

## デプロイ

Preview検証後、KPI専用本番ブランチだけをfast-forwardする。ゲームのVercel Production targetへの昇格は行わない（既存KPIはPreview target＋Production DB＋専用ドメインで運用）。
リリース先と検証結果は反映後に追記する。
