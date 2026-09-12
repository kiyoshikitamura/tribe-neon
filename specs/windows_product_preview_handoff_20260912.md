# Windows CodexへのProduct統合Preview引継ぎ

## 実行範囲
既存認証済みVercelで専用Preview配信まで。Production、共有alias、環境変数変更、課金公開は行わない。ユーザー実機確認は全ページ一括。既存Windows作業を上書きしない独立チェックアウトを使う。

## コード取得
同梱のgame03-product-preview.zipを新しい空フォルダへ展開する。履歴を含まない追跡ソース一式。現在の作業ブランチへreset/上書きしない。ZIPコメントに元のcommit SHAが入る。

```powershell
Expand-Archive .\game03-product-preview.zip -DestinationPath .\tribe-neon-product-preview
cd tribe-neon-product-preview
```

ZIPコメントのSHAを配信報告へ併記する。最新ローカルに未共有改修があればその差分だけ比較し、消さない。Tutorial復旧a744f98の関連コード保持は限定確認済み。課金候補も元から含むためPreview以外には出さない。

## 環境とDB
Vercel Project ID prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb、team kiyoshi-kitamura、project tribe-neon。
接続先Preview Supabase sufvuqdnqohpfzkwxohq。秘密値はログへ出さない。既存Preview設定を取得・確認し、Production接続なら配信を止める。
以下はPreviewに適用済み。再適用や一括db pushは禁止。
- 20260912064420_mission_content_entry_dependencies.sql
- 20260912073246_ranking_self_context.sql
- 20260912073913_mission_owned_state_progress.sql

## 確認と配信
依存関係をlockfileから導入し、TypeScriptとbuildを確認。配信はvercelのPreview targetを明示し、--prodを使わない。専用URLと配信SHA、接続先、Readyを確認する。
Quest / MyPage / Mission / Ranking / Navigationを実ブラウザでまとめて回帰確認する。NavigationはRaid未開催→Mission、参加未達保持、開催後再案内を確認。UIでの受取操作は専用QAアカウントのみ。

## 残件
specs/product_integration_status_20260912.mdを正として、Quest推奨戦力・地元補正、Mission累積・Guild在籍定義、ランキング100位外実接続、Navigation実接続を区別して報告する。未検証をPASSにしない。デザインの追加変更はユーザー監査後。
