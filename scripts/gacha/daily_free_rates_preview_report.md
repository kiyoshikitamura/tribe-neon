# 日次無料専用率・Preview実装結果

STATUS：Preview DB適用・受入PASS。Web配信BLOCKED。Production変更・告知掲載NONE。

## 対象

- Preview Supabase：sufvuqdnqohpfzkwxohq
- migration：20260911170125 / daily_free_gacha_rates_v1
- version：daily-free-2026-09-12-v1
- Character：N60.7 / R30 / SR9 / SSR0.3%
- Skill：N52 / R30 / SR17 / SSR1%
- Equipment：N49 / R30 / SR20 / SSR1%

get_daily_free_gacha_ratesから表示・無料抽選で同じ定義を参照。新6引数RPCは画面が取得したp_rate_versionを照合。新規の旧版・旧5/4引数・core無料実行は再読み込み要求で拒否する。完了済み同一requestの旧版・旧5引数再送は保存結果を返し、再抽選しない。

Tutorial専用RPC、通常draw_gacha_rarity、Pool、ガチャ価格、通常率は維持。アプリはTutorial時に新無料率を要求しない。無料の率取得失敗時は無料ボタンだけ停止し、通常率で代替しない。提供割合に日次無料とCASH/Ticket/DIAを区別して表示する。

## 受入

daily_free_rates_acceptance.sql：全23項目PASS、ROLLBACK。
3カテゴリ日次無料10連、同request再送、日次二重実行拒否、旧率版/旧経路拒否、完了済み旧requestの6引数/5引数再送、異なる引数拒否、通常3カテゴリ×CASH/DIA/Ticket、Special3カテゴリ×DIA/Ticket、Tutorial9枠通常率＋SSR保証＋再送。

検証用の抽選呼出記録、QA資産、無料権利、履歴、Special OPENは同一transaction内のみで全てROLLBACK。受入中の抽選helper計測は既存抽選式に呼出記録を加えたもので、統計によるSSR実測率の検証ではない。

適用前後のmaster/rates/pool/Tutorial定義のハッシュ一致PASS。新RPCのauthenticated実行、anon実行拒否、率参照anon許可を確認。
UIの契約検証テストPASS。型検査PASS。Preview接続・mock無効のwebpackビルドPASS。

## Web配信の不足

VercelのCLI認証・VERCEL_TOKEN・project接続設定が現環境にない。Vercelプラグインの再提案は行っていない。
固定Preview URL：NONE。実機UI受入：未実施。既存URLに今回の画面修正が配信されたとは扱わない。
旧Preview画面は新しい無料RPC契約へ未対応のため、無料実行時に再読み込み要求となる。DBだけ適用済みで画面配信待ちという制約を保持する。

## 配信引継ぎ

1. 本候補を専用作業フォルダへ取得する。過去の古いブランチ全置換で最新のギルドチャット等を上書きしない。本番合流時は本無料率差分だけを最新受入候補へ合流する。
2. NEXT_PUBLIC_APP_ENV=preview、NEXT_PUBLIC_USE_MOCK_DB=false、NEXT_PUBLIC_SUPABASE_URL=https://sufvuqdnqohpfzkwxohq.supabase.co とPreview公開キーを使用。
3. 専用Previewへ配信。Production・共有alias・Feature Flag・課金公開・newsは変更しない。
4. DB SQLは適用済み。再適用不要。既存Previewへ他機能のmigrationを重ねない。
5. 3カテゴリの無料／通常提供割合表示、無料10連、Tutorial保証、再読み込み案内を実機確認。固定URL・SHA・接続先・READYを返す。

この候補には以前の3レーン統合候補を基礎にしたUI/課金準備コードが含まれる。無料調整以外の本番公開承認を意味しない。
既報のSpecial CASH拒否guardは今回取得したPreview5引数定義にはなかった。現状維持で今回の変更に混ぜていない。課金公開時の別Gateとして残す。
