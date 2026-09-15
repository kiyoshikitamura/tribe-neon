# Preview Google認証競合・現在データへの置換

対象は `codex/formal-open-integration-preview-20260914` / Preview `sufvuqdnqohpfzkwxohq` のみ。Production変更禁止。

## 原因と修正

Googleの既存登録と現在の匿名プレイヤーが別UIDである場合、連携は完了していないため未認証表示自体は正しい。一方、OAuth callbackから警告なしにマイページへ戻り、競合ダイアログの初期表示も漏れる動作は不具合。

- callbackで警告を表示し、ユーザーの確認前にマイページへ戻さない。
- 復帰先でも競合状態を初期化してデータ選択を表示する。
- 現在データで置換する処理を実装。既存Googleデータと現在データの名前を示し、不可逆な削除について再確認する。
- 既存Googleの署名付きID tokenを削除前に検証し、同じtokenで現在UIDへnative linkIdentityする。削除後の別Google選択を防ぐ。
- 現在UID・育成・所持品を維持する。既存ゲームプロフィールの削除と旧JWT拒否をDB処理し、公式Auth admin APIで旧認証登録を削除する設計。

## 有効化前の必須残件

置換機能は無効で配信する。警告修正は設定に関係なく有効。

- 候補SQL `docs/development/sql/preview_google_replacement_intents_candidate.sql` は **未適用**。既存Migrationは再適用しない。
- 候補SQLの保護履歴判定・基本プロフィール関連の削除範囲を確認する。
- Previewの専用fixtureでDB・旧JWTの実HTTP拒否・競合・cleanupを確認する。
- Google OAuth clientの許可JavaScript originと `NEXT_PUBLIC_GOOGLE_CLIENT_ID` を設定する。
- disposableアカウントでGoogle ID token連携、応答欠落からの復帰、二重確定を実試験する。
- 上記後にのみ `GOOGLE_ACCOUNT_REPLACEMENT_ENABLED=true` と `NEXT_PUBLIC_GOOGLE_ACCOUNT_REPLACEMENT_ENABLED=true` をPreviewに設定する。
- 現在の匿名ユーザーが使っているホスト名を確認する。固定Deployment URLは再読込しても新コードにならず、別ホストへ匿名セッションは引き継がれない。

対象実ユーザーのデータ削除・紐付け変更は未実行。実Google OAuth、実機確認はPASS扱いしない。

## 検証

型チェック、サーバー状態遷移、ID token署名・audience・nonce・期限・対象不一致拒否、保存情報と復帰の単体試験を実施。実DB・Google連携の代用ではない。
