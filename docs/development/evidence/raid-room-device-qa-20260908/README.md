# Preview端末用QAログインの準備

対象はPreview `sufvuqdnqohpfzkwxohq` の既存Raid専用3ユーザー。Auth Admin APIのupdateUserByIdで同じUUIDに専用メール・個別パスワードを設定し、email_confirm=trueで確認。通常UIの「パスワードを設定して完了」からcomplete_tutorial_authentication(EMAIL)を完了した。Authテーブルの直接SQL更新、新規ユーザーの作成は行っていない。

| 役割 | プレイヤー | ログインID |
|---|---|---|
| 主催者 | R0908H01 | raid-host-0908@qa.example.com |
| 通常参加者 | R0908N01 | raid-normal-0908@qa.example.com |
| 救援参加者 | R0908R01 | raid-rescue-0908@qa.example.com |

メールアドレス形式の専用ログインIDで、メール受信には使用しない。パスワード・セッション・管理キーはこの記録、Repository、ZIP、GitHubに含めない。

## 端末での操作

1. SafariまたはChromeで https://tribe-neon-arnbhwc0s-kiyoshi-kitamura.vercel.app を開く。
2. TAP TO START → データをお持ちの方 → メールアドレス・個別パスワード → メールでログイン。
3. 既に別アカウントなら、タイトルの「ログアウト／別アカウント」かプライベートタブを利用する。「はじめから」は選ばない。
4. UI検証は初級・主催者R0908H01・9/9 21:03期限のRoom。9/9 19:40期限の自然失効用Roomは操作しない。

## 検証・保持

3名とも新規ブラウザーコンテキストでpasswordログイン、正しいUUID、非匿名、レイド一覧、再読込後のセッション保持を確認。主催者・救援はChromium、通常参加者はWebKit。UI連携後の最終パスワードでもAPI再ログインし、get_current_onboarding_stateのgameplay_authorized=true、auth_method=EMAIL、identity_integrity_valid=trueを確認。ローカルQA harness用セッションも同じ3名で更新した。

初回はメール連携の最終確認が必要で画面操作が止まった。initial-link-pending.jsonに記録し、正規UIで完了後に全3名PASS。login-verification.jsonは認証・画面遷移を検証した記録で、ブラウザー例外の網羅検査ではない。

既存19ユーザー全行ハッシュ、対象3Room/boss全行、Room参加者、専用Guild所属を前後比較して一致。QA分類とKPI除外trueを確認。戦闘・HP変更・報酬受取・Cron・フラグ変更は行っていない。Deploy・push・Release変更・本番変更もなし。

Supabase Auth Admin APIの仕様確認: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
