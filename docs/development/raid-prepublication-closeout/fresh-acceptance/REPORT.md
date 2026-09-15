# Fresh不足受入 — HTTP PASS / UI未確認

実施: 2026-09-10 00:00–00:05 JST。候補8c0fa6b2131faaed7b63e172ac12424d3fe8f6be。対象は専用Preview sufvuqdnqohpfzkwxohqの既存Fresh QA216907d1-92e3-4ba8-bafd-953bbd51faecだけ。候補フロントの新配信前にHTTP不足受入を実行したため、この結果を候補DeploymentでのUI検証とは扱わない。

## 既存結果と今回結果

既存raid_fixes_preview_execution.mdでは同じユーザーが正規Setup→無料10連→初期装備5件→育成→編成→Quest→実戦→案内→Homeへ到達。メール確認/通常再ログインは未確認だった。今回の最初の実DB照合でtutorial COMPLETE、Auth匿名・passwordなし・email未確認、GRANTED receiptと同じ5装備UUIDを確認。

既存prepare-device-qa-auth.mjsと同じ正規認証loader（ホーム配下.supabase/access-tokenからManagement APIの当該Preview api-keys取得）でAuth Admin GET権限を確認。既存QA分類qa有効を確認後、同UIDだけを専用非配信メール形式のQA identityに設定しemail_confirm=true。新規ユーザー・外部メール送信なし。Auth tableをSQLで直接更新していない。管理確認は実メール受信確認の受入ではない。

1回目の実password signin→ensure初期装備再送→signout→2回目password signin→ensure再送はPASS。ただしget_current_onboarding_stateがauthentication_pending=trueだったため、その時点を完了扱いしなかった。

続いて同UIDの専用資格だけを再設定し、通常password signin後に既存complete_tutorial_authentication(p_auth_method=EMAIL)を本人JWTで実HTTP呼出し。gameplay_authorized=true、authentication_pending=false、identity_integrity_valid=trueを確認。返却tutorial_stepはAUTHENTICATION（既存RPCの結果）として記録し、文字列COMPLETEへ偽装していない。その後のsignout→password signin→ensure再送も同UID/同5UUID/追加0でPASS。

最終の独立DB read-only照合ではreceipt作成09:08:16 UTC/完了09:10:54 UTCが不変、state GRANTED、equipment5件、qa分類有効、Auth非匿名/確認済み。管理設定以外のゲームデータ操作は本人の既存認証完了RPCと初期装備ensure再送のみ。受入対象外の既存403ユーザーへの救済なし。

## 証跡

- same-user-http.json: 初回password/signout/relogin、pending検出。
- same-user-completion-http.json: 正規認証完了RPC、password再ログイン、追加装備0。
- final-db-readback.json: 別接続でreceipt/装備/QA分類保持。
- scripts/raid-prepublication-fresh/verify-same-user.mjs: 対象Preview/固定UID/既存5UUIDをguard。applyは匿名の固定QAのみ、complete-pendingは同じ専用QAのpendingだけ。秘密・sessionは出力/保存せず各run終端でsignoutした。passwordはメモリ内で破棄したため、このQAを次回ブラウザーへ渡す場合は既存の承認済みQA資格準備工程で再設定が必要。

## UI確認の具体的阻害

CUA初期化でcua.getState()はapps=[]/browsers=[]。cua.getBrowser({url:既存専用Preview})は「No browser is available」を返した。

返却されたCUAツールの明示指示:
> Use `cua_repl` (JavaScript) for all UI actions.
> Do not use other technologies besides `cua_repl` for computer interactions, unless specifically requested by the user

この制限のため、一般ブラウザー操作を別方式で代行して未接続surfaceを迂回していない。コードのMock E2Eと実UI操作は分ける。

未確認: 同一新規ユーザーを候補フロントで最初から最後まで今回実行したFresh UI、通常攻撃/スキル命中画像、HP/ダメージ数値同期、命中cutin解除、SKIP非表示、Result→チュートリアル継続の実接続表示、人の実端末受入。旧Previewの実画面証跡と親の候補Mock captureは既存証跡として別記録。HTTP再ログインPASSをUI Fresh完走PASSへ読み替えない。

Character側の統合受入先は親が後続で配信確認した専用Preview:

- https://tribe-neon-fq91mseva-kiyoshi-kitamura.vercel.app
- Deployment: dpl_ED1F6kxMiv12LQXaLwv72T1Mfbxk
- 固定source: 8c0fa6b2131faaed7b63e172ac12424d3fe8f6beのarchive。親報告READY/HTTP200、build active configはPreview ref/anon一致。

この配信は本報告のHTTP試験後であり、当該Deploymentでの実UI受入PASSを意味しない。前記未確認表示と人の受入をこのURLでまとめる。本担当のProduction書込/本番Deploy/alias変更/Cron/共有設定変更は一切なし。

API根拠: [Supabase updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)（当該QAへの管理更新と通常signinを分離）。
