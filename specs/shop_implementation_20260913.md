# ショップ実装差分 2026-09-13

基点: a70421643702e47a88366ef9eea952f435ef2990
正本: monetization_release_20260912.md

## 差分

- 最新の常設4パックを商品マスターに反映。税込・購入回数上限を表示。
- ビギナー100円1回、チケット1,500円3回、育成500円3回、覚醒1,000円3回。
- 上限到達後も購入済み商品を表示し、購入ボタンを無効化。
- 購入前ダイアログに全内容・税込価格・残回数・購入分120日期限を表示。
- 購入期限とPresent受取の関係を表示。購入分消費のAuthorityは課金レーンで実装。
- 通常ショップは既存ダイア交換10商品を維持。表記をダイアに統一。
- 旧ビギナー画像は内容不一致の可能性があるため使用しない。説明的な販促文は追加せず商品内容を表示。
- 未準備状態を無期限スピナーにせず購入不可と表示。スピナーは取得・処理中のみ。

## 課金レーンとの接口

`GET /api/billing/config`:
- `available`: server readiness
- `catalogVersion`: `20260912`。DBの価格・数量・上限・期限の一致をserver側で検証。
- `mode`: sandbox時だけテスト決済表記。
- `disabledProductIds`: 販売未準備の商品ID配列。現時点でDIA商品の有償/無償内訳未FIX。

availableかつcatalogVersion一致の場合だけ販売操作可能。古いDBに最新商品名・内容で購入させない。

購入数は既存bootstrapのuser_shop_purchasesを使用。最終上限判定・二重購入防止は既存server側を維持。チェックアウト遷移完了までの背面操作防止はGameContext担当へ引継ぎ済み。

## 商品ID

- beginner_pack_01（既存維持）
- ticket_pack_01
- growth_pack_01
- awakening_pack_01

DIA6件、通常10件の既存IDは変更しない。

## 検証

- `node scripts/verify_shop_release_catalog.mjs`: PASS。全4パック合計9,100円、各SP16枚、CASH91,000、素材数量、購入回数と通常交換値を正本と照合。
- Typecheck: PASS。
- 変更TS/TSX・検証スクリプトESLint: PASS。
- Preview DB接続・実決済・実画面・実iPhone: 未実施。

## 統合時の残項目

- 課金レーンのconfig/catalog/120日資産処理の統合が必須。
- DIA有償/無償内訳、派生資産の期限は未FIX。Shopが独自決定しない。
- 各商品購入→配送→残回数更新、上限時拒否、購入途中離脱/再送、モバイルの購入前文言をPreviewで確認。

## 後続：購入分の有効期限表示

- config/catalog一致時のみ、購入履歴付近に「購入分の有効期限」を追加。
- 本人タップで `billing_refresh_paid_assets()` を呼び、未使用の購入分の数量・日本時間期限・受取済み/未受取を表示。
- 期限の近い順。既存無料在庫やDIAの有償/無償配分は変更しない。
- 連打中の重複RPCを防ぎ、失敗時は再試行可能。未導入DBに無条件RPCしない。
- Typecheck/変更ESLint/diff-check PASS。接続実画面未実施。
