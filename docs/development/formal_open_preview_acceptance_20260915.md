# GAME03 / TRIBE NEON — 最新Preview実機受入

更新日: 2026-09-15 UTC。9/14の実機確認セットに記載された旧SHA・旧URL・未完成扱いを、この版の確認対象へ持ち越さない。

## 配信対象と現在の障害

| 項目 | 確認結果 |
|---|---|
| 調査開始時のコード | `e7b45e56cc611127c908c384389f87cd3ebfbf09` |
| 調査対象Deployment | `dpl_F2ozkvcxtpDb4PJNf5C1ayjGginp` |
| Vercel管理リンク | https://vercel.com/kiyoshi-kitamura/tribe-neon/F2ozkvcxtpDb4PJNf5C1ayjGginp |
| 意図するSupabase | Preview `sufvuqdnqohpfzkwxohq` |
| 固定Preview URL | 未取得。旧URLを最新として配布しない |
| Vercel状態・配信SHA・接続DB | 3点セットの独立照合は未完了 |
| 9/15 Vercel接続確認 | 正規 `get_deployment` は403。`kiyoshi-kitamura` scopeへの再認証が必要との応答 |
| ローカル配信認証 | CLI認証、`VERCEL_TOKEN`、`.vercel/project.json`なし。`.env.example`以外の実環境ファイルなし |
| Production | 操作対象外。変更・接続しない |

親エージェントの追加統合でSHAが更新されたら、その配信を最終対象とする。この文書の調査開始SHAに固定して古い候補を受け入れない。GitHubのVercel status成功だけでは、固定URL・実配信環境・実機確認のPASSとしない。

正規Vercel接続のscope不足をBrowserで管理画面へ回り込んで解消することはしない。ユーザーへの依頼は全系統の終了時に親エージェントがまとめる。

### ローカル表示検証の試行

Vercel管理操作の代替ではなく、独立した表示単体検証として、親が起動した既存build（`e7b45e5`）の `http://127.0.0.1:3100/qa/presentation?scenario=first-home-fresh` を正規Browser APIで開いた。Browser起動は成功したが、遷移は `net::ERR_BLOCKED_BY_CLIENT` となった。Browserのトラブルシュート手順を確認し、別の制御方式・proxyによる回避は行っていない。

したがってHomeを含むブラウザ描画確認・mobile viewport確認は未実施。アプリ側の画面不具合と判定した結果ではない。ローカルserverのReady、SSR検証、型検査等とは区別する。

## 最初の確認（既存Preview QAアカウント）

固定URLと接続DBを確認後、iPhone Safariなど普段の端末で実施する。パスワード・Tokenを報告に貼らない。

| ID | 操作 | 期待結果・記録 |
|---|---|---|
| D01 | タイトル→既存QAログイン→MyPage | 初期化や意図しない新規作成なし。画像、CASH、AP/BP/RP、フッターを確認 |
| D02 | MyPageを上下スクロール、Banner切替→戻る | 小Raidなし、大Raid/Banner/Activity導線あり。横はみ出し・タップ不能なし |
| D03 | Battle TOP→対戦相手選択前 | 勝利200 CASH＋レイドチケット1、敗北50 CASHを確認可能 |
| D04 | 正規PvPを1戦完了→Result→通常帰還 | WINは200 CASH＋Ticket1、LOSEは50 CASHのみ。BP1消費、RATE表示、資産差分がreceiptと一致 |
| D05 | WIN Resultの「レイドに挑戦」→Ticket使用 | 強制遷移なし。既存回復仕様に従いTicketを1消費してRP回復。上限に余裕があるQAで実施 |
| D06 | Raid TOP→敵選択→新規Raid準備 | 地域攻略ヒントと難度が一致。上級3%以上、超級5%以上の条件表示。既存Raidを新規編成へ置換しない |
| D07 | Questの街変更→難度選択 | 初級が初期選択、開放済み難度が押せる、未開放は押せない。六本木の難度順を確認 |
| D08 | Character/Equipment強化画面→対象切替 | EXP予測、素材数、費用が対象に追随。SkillはLvではなく＋値。旧応答で別対象を上書きしない |

## 実データの受入（D01〜D08の後）

| ID | 操作 | 期待結果・記録 |
|---|---|---|
| E01 | PvPで合計3勝 | 勝利由来Ticket合計3。追加3勝Bonus、通常/特別ガチャTicket、EXP素材、指南書等の通常Battle配布なし。敗戦分は別記録 |
| E02 | 新規Quest開始→完了受取 | 基礎300/600/1000＋保存済み地元加算。開始時の獲得予定CASHと結果が一致。資産へ直接反映 |
| E03 | 旧未受取QuestがあるQAで受取 | 保存された旧基礎600/1200/2000＋地元加算を保持。対象がなければ未実施。確認用に既存履歴を書き換えない |
| E04 | 7地域のQuest報酬案内 | 新宿キャラ素材、渋谷Normal Skill Ticket、池袋装備素材、六本木指南書、秋葉原Normal RANDOM、川崎改造パーツ、横浜バランス。抽選1回の当落を確率検証と扱わない |
| E05 | Quest発見Raidを正規撃破 | Item2倍ではなく、元Quest保存基礎CASH相当＋User EXP50%。receipt、資産、画面一致 |
| E06 | 通常Raidの実戦→正式終了→Mission | 保存Main編成で戦闘。Mission1回増、戻る/reloadで増えない。ダメージ/HP/演出/帰還が連続して成立 |
| E07 | 上級または超級を正規撃破 | 累積実適用ダメージ条件達成でInstance報酬。分母は保存max HP。ResultとInventory一致。ローカル敵回復を共有HPへの回復として表示しない |
| E08 | 別Instance撃破・日次表示 | 同一Instance再表示で再付与なし。Instance報酬と日次抽選を区別。JST境界・当落固定はDB試験結果を併記 |
| E09 | Character/Equipment素材を混合投入 | 予測Lv/余剰EXP/結果/消費一致。上限到達・不足時・対象切替確認。強化後編成を再読込して実戦 |
| E10 | 覚醒/LB・おすすめスキル | 正規条件で実行可能。専用枠、他キャラ使用中、候補の対象が正しい。結果と所持数一致 |
| E11 | Main保存・Favorite変更→reload | Quest/PvP/Raid準備5人と装備/SkillがMain一致。MyPage/Character/Public ProfileのFavoriteは編成先頭と独立 |
| E12 | Present・Guild・Ranking・Chat等 | 架空アンケートPresentなし、正規Present保持。Guild在籍Mission、紋章所持/装備、公開プロフィール表示。Daily/Seasonを閲覧可能 |
| E13 | AP既存50超・回復・消費 | 既存overflowを切り捨てない。QAの正規操作による回復・消費が反映。該当QAなしは未実施 |
| E14 | Tutorialを新規QAで開始→Home | 無料ガチャ/編成/派遣/時短/NPC戦が継続。命中・HP・数値・カットイン解除、SKIP非表示、Result後継続 |
| E15 | Stripe Sandbox→購入→受領→育成→Battle | 課金担当の利用可能判定・テスト接続完了後に実施。実課金/Productionの代替にしない |

3勝や高難度撃破はゲームの正規結果を使う。画面受入のため勝敗・資産・共有HPを改変しない。初回finalize競合、障害rollback、閾値直前/一致は技術試験担当が受け持ち、端末での不自然な再現を要求しない。

## 表示fixture（補助）

PreviewでQAページが有効な場合だけ、`/qa/presentation?scenario=first-home-fresh`、`card-visual-skill-levels`、`public-user-profile`を利用する。URLの`scenario`値だけ切り替える。これらは表示用で、一部ボタンや報酬が実ゲームへ接続されない。fixtureからのPASSはD/E項目の実データ受入へ転記しない。

## 最終依頼へ集約する不足

1. Vercel接続を`kiyoshi-kitamura`チーム権限で再認証するか、対象Deploymentの固定Preview URLと配信SHAを提示。実配信のPreview DB接続照合は別途必要。
2. 既存Preview QAのログイン可否・受入用資源を確認。資格情報そのもののチャット貼付は不要。
3. 上記を解消した最終Previewで本人のiPhone Safari受入。自動検証やdesktop表示と区別する。

現時点で上記D/E項目に新たな実機PASSは付けていない。今回作成したのは最新実装に一致する受入手順と阻害の確認記録。

```text
対象URL / 配信SHA:
端末 / OS / ブラウザ:
確認区分: 実データ / 表示fixture
QA表示名（秘密情報なし）:
項目ID:
結果: OK / NG / 未実施
操作順:
期待 / 実際:
開始前後の資産差分（必要項目のみ）:
スクリーンショット / 動画:
```

## 2026-09-15 追加対応：Git連携経由の実配信確認

- GitHub check-runsのVercel Preview CommentsからブランチURLを取得： https://tribe-neon-git-codex-formal-open-integr-800ed5-kiyoshi-kitamura.vercel.app/
- 00:38 UTCのconfig GETでHTTP 200、配信SHA db20428a09c99a252ddc8060813fb88803951705、preview_database=trueを確認。GitHub tribe-neon statusもsuccess。ブランチURLは更新されるため、以降の実機受入は最新SHAを再照合する。
- 課金はENVIRONMENT_INVALID。sandbox_enabled / stripe_test_key_present / webhook_signing_secret_present / return_origin_valid がfalse。mode_sandbox / non_production_runtime / preview_database / service_role_present はtrue。キー未設定と形式不正の区別はこの診断だけではできない。
- 現時点でユーザーに必要な課金設定はPreview対象のBILLING_SANDBOX_ENABLED=true、STRIPE_SECRET_KEY（sk_test_）、STRIPE_WEBHOOK_SECRET（whsec_）、BILLING_RETURN_ORIGIN（利用するPreview origin）。秘密値はチャットへ貼らない。戻り先・Webhook登録URL・Auth許可URLはQAで使うoriginと整合させる。設定後はGit連携で新配信し再診断する。
- Cloud Browserで公開タイトル→TAP TO START→開始選択の遷移PASS。Home表示fixtureは読み込み後に描画、画像欠落0、desktop viewport 1363で横overflowなしを確認。HomeのBattleボタンはfixtureのno-opで、実データのD/E受入PASSにはしない。ブラウザ拡張由来のmetadataエラー1件はアプリ不具合と分類しない。
- 今回は公開PreviewでBrowser動作可能。以前のローカルERR_BLOCKED_BY_CLIENTを現在の公開Previewの阻害条件として扱わない。QAログイン・実戦・iPhone Safari・Stripe接続は引き続き未実施。
- バッグのBP/Raid Ticket使用成功後にbootstrap再読込が失敗すると誤って使用再試行を促す問題を修正。成功receiptを維持して再読込案内を表示し、別ユーザーへの遅延通知を抑止。両Ticket・刷新失敗・不正receipt・連打・ユーザー切替のhandler回帰PASS。既存Inventory projection検証もPASS。
- Preview診断へ検証済みVERCEL_URL由来のdeploymentUrlを追加。公開hostのみ返し、秘密値/任意URLは返さない。固定Deployment URLの取得をVercelプラグイン403に依存させない。Production応答の互換性を保持。
- DB変更・Migration再適用・Production反映なし。Vercel403再接続は実装/配信の前提条件から除外済み。

最新の依頼残件：上記4項目のPreview課金設定、QAログインと本人実機受入、技術競合試験用Preview PostgreSQL接続の安全な設定、正式OPEN/操作停止/Mission Claim起算日時。Production反映は別承認。

確認範囲：preview_database=trueは配信サーバーのDB URL設定一致を示す。今回は環境検証で停止しており、config経由のDB照会成功・ServiceRoleの有効性までは証明していない。バッグの修正もbootstrap内部で握りつぶされる取得失敗は検出範囲外。
