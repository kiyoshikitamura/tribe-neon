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

- `20260915063809_preview_google_replacement_guard.sql` をPreviewへ適用済み。**再適用禁止**。旧candidateファイルは設計・rollback試験の入力として保持する。
- 基本プロフィール参照の範囲を改善し、DBの10項目rollback試験PASS。対人・ランキング報酬履歴のあるアカウントは現時点では置換を拒否する。一般ユーザー向け提供にはこれらの履歴を保持する退役方式が残件。
- 専用匿名fixtureで旧JWTの実HTTP拒否を検証済み。通常200→DELETING登録後401/PT401→試験ledger削除後200。Google実連携試験とは別。
- HTTP試験後のAuth fixture・ledger fixtureは各0件。既存2ユーザーは保持。試験用tokenファイルも削除済み。
- Google OAuth clientの許可JavaScript originと `NEXT_PUBLIC_GOOGLE_CLIENT_ID` を設定する。
- disposableアカウントでGoogle ID token連携、応答欠落からの復帰、二重確定を実試験する。
- 上記後にのみ `GOOGLE_ACCOUNT_REPLACEMENT_ENABLED=true` と `NEXT_PUBLIC_GOOGLE_ACCOUNT_REPLACEMENT_ENABLED=true` をPreviewに設定する。
- 旧匿名データの移行はユーザー指示で対象外。今後は下記branch URLから既存Googleでログインして検証する。

対象実ユーザーのデータ削除・紐付け変更は未実行。実Google OAuth、実機確認はPASS扱いしない。

## 検証

型チェック、サーバー状態遷移、ID token署名・audience・nonce・期限・対象不一致拒否、保存情報と復帰の単体試験を実施。実DB・Google連携の代用ではない。

installed Supabase SDKと本番callback関数を実行する7試験もPASS。送信先・nonce・元JWT、不正応答拒否、連携後finalize失敗からconfirm/relinkなしの復帰を含む。

## 配信・設定

- 現在の実装SHA: `17a61bba8e8da00c873b267db1608232f55af842`、READY / source=git / Preview。
- 更新用URL: https://tribe-neon-git-codex-formal-open-integr-800ed5-kiyoshi-kitamura.vercel.app/
- 固定URL: https://tribe-neon-d7ww5d0sp-kiyoshi-kitamura.vercel.app/
- HTTP configでSHA一致、preview_database=true。置換APIは無効状態のPOSTで403を返すことを確認。
- 通常OAuth authorizeは302でGoogleへ遷移。既存Preview Client ID `908587971636-uje37rninm0ta5942860uuim01qgeg84.apps.googleusercontent.com` とSupabase callback一致を確認（認証完了の確認ではない）。
- GIS向け追加設定: 上記Client IDを `NEXT_PUBLIC_GOOGLE_CLIENT_ID` に設定し、Google側の許可JavaScript originへ更新用URLのoriginを追加する。既存設定は削除しない。
- この環境にはGoogle Cloud設定用の接続機能、Vercel環境変数の変更機能・CLI tokenがないため、設定変更は未実施。2つの有効化flagは実Google試験完了までoff維持。
- Advisors: 新ledgerのRLS/no-policyはservice-onlyで意図した拒否。hookのSECURITY DEFINER実行権限はPostgREST前処理用で、対象UIDの拒否のみ・データ返却/書込みなし。retirement関数はservice-onlyを試験済み。
