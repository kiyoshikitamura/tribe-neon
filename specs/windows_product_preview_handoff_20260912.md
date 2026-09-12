# Product監査修正候補：専用Preview再配信

## 取得
Repository: kiyoshikitamura/tribe-neon
Branch: codex/product-preview-20260912-694db8f
このブランチをfetchし、報告された最新SHAを独立作業フォルダでcheckoutする。旧80bd05cのPreviewへの追加修正。ZIP不要。既存Windowsの未共有作業は上書きしない。

## 配信
既存Vercel CLI認証と既存Preview設定を利用。
Team: kiyoshi-kitamura / Project: tribe-neon
Project ID: prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb
Supabase接続先: sufvuqdnqohpfzkwxohq
必ずPreview targetへ配信。Production、共有alias、環境変数を変更しない。
秘密値は出力しない。接続先が異なる場合は配信を止める。

## DB
今回追加の以下2件はPreview適用・実RPC ROLLBACKテスト済み。再適用しない。
- 20260912153009_mission_claim_deadline_and_event_history.sql
- 20260912153017_ranking_context_audit_fixes.sql
前候補の3 migrationも適用済み。一括db push不要。

## 結果
固定Preview URL / 配信SHA / Deployment ID / Supabase project ref / READY / HTTPを返す。
修正と検証の詳細はspecs/product_audit_fixes_20260912.md。
実ブラウザの受取・再読込・イベント切替・ランキング・Navigation回帰は未完了。全ページのユーザー実機確認は最後に一括。デザイン追加調整はその後。
