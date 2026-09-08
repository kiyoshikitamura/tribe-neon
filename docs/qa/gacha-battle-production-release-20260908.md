# ガチャ・非レイドバトル 本番リリース候補の検証記録

更新日: 2026-09-08。STATUS: **反映済み**。全体CI PASSではなく、残る既存失敗・旧表示テスト不整合は下記のとおり。

## 最終配信

- 本番SHA: `59be3c715defa33c61adbfb0e84f16778f34525d`
- Vercel deployment: `dpl_8up8KQuqxybgbAC8mBNCM2vhudW9`（target=production / READY）
- 固定URL: https://tribe-neon-mhb2ax66b-kiyoshi-kitamura.vercel.app
- 本番URL: https://www.tribe-neon.com/
- リリース候補PR: https://github.com/kiyoshikitamura/tribe-neon/pull/29 （Draft、baseは実配信元ブランチ。マージはしていない）

Production設定で新規ビルドし、APP_ENV=production / Mock=false / QA=falseをbuildとruntime両方で明示。固定URL確認後、ユーザー承認に基づきガチャ＋非レイドバトルを同時にpromoteした。Previewビルドは昇格していない。

本番URLでタイトル→開始選択、法的情報3ページ、QA5経路404、立ち絵・背景・戦闘画像200、ガチャ／バトル両フォントのブラウザdecode成功を確認。pageerror=0。通信先は`https://api.tribe-neon.com`のみで、CNAMEはProduction DB識別子と一致。

ガチャ・準備・VS・バトル・Resultの通し確認と確定処理は、同一製品ソースのローカル候補＋専用Preview QAで実施。本番アカウントを新規作成・消費する追加検証は行っていない。この確認範囲を本番実アカウントの全操作確認済みとは扱わない。

promote直前・直後の66 alias比較では、変更は`tribe-neon.com`、`www.tribe-neon.com`、`tirbe-neon.vercel.app`の3件のみ。KPI両ドメイン・共有Preview既存aliasは無変更。生成されるproject既定aliasはProduction候補作成時に新deploymentへ付与された。

## 配信基準と取り込み

- 反映直前SHA: `418bf0fbadf0a92422e25452d257f9a718a46efb`
- 反映直前の配信元: `codex/world-intro-skip-20260907`
- 反映直前Production deployment: `dpl_5aQ6LcHhifhK5wqF67x18G6QGJ2a`
- 固定URL: https://tribe-neon-p5bkvfwt1-kiyoshi-kitamura.vercel.app
- 本番URL: https://www.tribe-neon.com/
- Vercel project: `prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb`
- Vercel設定上のProduction branchは`main`。実配信は上記ブランチ由来であり、設定値だけを基準にしない。
- 候補ブランチ: `codex/gacha-battle-production-20260908`
- 演出統合commit: `17fa2ce`（後続はテスト・記録の更新）

実配信SHAから分岐し、PR #28のbase `b08e396`から演出head `aec3e61c5195da74848692e691ec0384e8e807a3`までの差分だけを3-way適用した。PR #28自体はマージしていない。実配信に含まれるWorld Intro SKIP、流入・キャンペーン対応などを保持し、並走中の新しいKPIブランチおよびRaid専用修正は取り込んでいない。

## 引き継ぎ9ファイル

| 対象 | 対応 |
| --- | --- |
| battle-full-skill-load.spec.ts | `.sb-root`、参加者ID付き両陣営、`.sb-controls`、完全一致SKIPへ。5対5・配置・Result検証を保持 |
| quest-natural-completion.spec.ts | バトルスタート完全一致 |
| gacha-character-v3.spec.ts | 同時刻clock install/pause、2900ms無効・3010ms有効を保持。入場アニメーション終了時の幾何検証は同じ条件をpoll |
| verify_kpi_tutorial_union.mjs | 実配信基準では既に削除済み。KPI差分を復活させないため再作成しない |
| legal.css | 本文リンクにinline-flex・中央整列・最小44px。本文無変更 |
| MockSupabaseClient.ts | 解決済みUID保存、購読・解除、メールログインSIGNED_IN通知。実認証コード無変更 |
| playwright.config.ts / run_browser_e2e.mjs | ローカルサーバーだけにKPI fixture Basic認証。Vercel設定には追加していない |
| quality.yml | browser-e2eをpreview/mock/Preview URLへ。KPI APIはfixture。実DB秘密情報の追加なし |

周辺のテスト修正は、タイトルモーダル内の操作対象特定、タイトル復帰後のエラー表示、OAuth callback fixtureの初期化競合、可変テストポート、画像レアリティバッジ・結果画面の識別に限定する。検証のskipや期待条件の無効化は行っていない。

## 検証

- Preview環境・Mock DBの`npm run build`、`npm run typecheck`: PASS。
- Lint: エラー0、既存warning 1718。ローカル作業用scratchを製品ソースと混同しない。
- quality.yml内の契約検証23本: PASS。visual-complianceのfixture台帳に既存追加シナリオを反映後に再検証。
- street battle integration、全60キャラセリフ、MVP、バトル演出契約: PASS。
- Deno resolve-battle型検査: PASS。engine_test: 3 PASS。配信は行っていない。
- 演出ガチャ9件: PASS。初回390pxの入場中幾何判定を同条件pollへ修正して再実行。
- 通常クエスト自然完了・5対5負荷テスト: PASS。
- 新規battle-live検証: 390×700、320×568の2件PASS。フォント待機、準備、VS、倍速、中央アイコンカットイン、SSR不透明立ち絵・セリフとボタンの分離、SKIP、Result/MVP、戻りを確認。
- title-auth最終: **41 PASS / 2 FAIL**。引き継ぎで指定された3失敗は再検証PASS。
- KPI fixtureテスト3件: PASS。
- 残り全体E2E初回: **211 PASS / 29 FAIL**。全240件を実行し、未実行による打ち切りはしていない。
- レイド関連6件、法的情報の表示テスト: PASS。
- m9ガチャ→育成・編成・保存復帰の追加再検証: 3 PASS。新規モバイル通しテストは後続の旧準備画面セレクタで1 FAIL。
- m9xの10枠目SSR保証・育成→編成: キャラ名セレクタ更新後1 PASS。
- Production指定のローカルビルド: PASS。QA4経路404、鉄瓶ゴシック・戦闘画像3素材200。公開キーにはビルド専用placeholderを用いた非接続検証で、本番APIの認証・実データ疎通の代わりではない。

これは複数回の検証記録であり、合算して「単一の全体CI PASS」と扱わない。GitHub Actionsの全体成功は未取得。

## 残る失敗の分類

1. **既存基準でも再現**: 認証2件、Homeバナー2件、World情報復帰・iPhone入力2件、任意認証1件、参加後Home／最終案内3件。実配信418bf0fを別worktreeでビルドし、同じMock認証fixtureで再現した。演出を理由に本物の認証や公開状態を変更しない。
2. **旧演出とのテスト不整合**: c3r3 harnessの43シナリオ期待（現46）、旧battle DOM・旧SSR strip・旧FINAL HIT overlay・旧Result構造、m9 PvP準備とチュートリアルバトルの旧DOM。承認済み新デザインへ製品を戻してPASS化しない。各検証意図を新仕様に合わせて更新する作業が残る。
3. **ローカルテスト設定**: character-presentationの固定3100ポート。可変ポートへ修正後3件PASS。
4. **後続の旧期待**: m9チュートリアルの画像レアリティバッジと結果タイトルは更新し、ガチャ→育成・編成・保存復帰3件PASS。モバイル通しは準備画面の旧「出撃パーティ」セレクタで停止。消費・報酬検証済みと読み替えない。

## 実データと環境

Raid担当が共有Preview停止枠を19:17:02〜20:17:02 JSTと連絡。追加連絡でも停止継続の要請があり、解除通知前の共有Preview操作は行わない。

Preview実接続（Mock=false）の候補を別worktreeでローカルビルド済み。Raid担当から、新規QAユーザー1件自身のチュートリアル・ガチャ・クエスト操作だけは競合せず開始可能との回答を取得し、限定検証を開始。環境・配信の停止枠は継続。**検証完了までは実データ確定処理の合格を主張しない。** 固定Replay QAは確定処理の代用にしない。

20:08 JST追記: Raid担当より共有変更枠の解除通知を取得。限定実データ検証は完了しPASS。新規QA UID `ae28676d-bdca-4f8d-b574-183da188104c`、開始20:02:49 JST。チュートリアル10連履歴COMPLETED、Replay `03faa63f-9c01-4e1d-9245-e9e2fc6c99f8` がRESOLVED / PATROL_SERVER / NOT_REQUIRED、派遣COMPLETED / battle_resolved=true、ユーザーLv.2と報酬表示を確認。COMPLETE・所持キャラ・履歴・Replay・CASH・Lv/XPは再読込後も保持。通常有料1回は表示価格100 CASHで2000→1900、履歴1→2、再読込後に重複消費・追加履歴なし。QAユーザーは証跡用に保持しRaid担当へID共有済み。

初回通常ガチャ移動時は既存のミッション案内・アカウント保護案内が自動テストを遮ったため、同じQAセッションで「あとで」「閉じる」を操作して継続した。製品側の変更や新規QA再作成はしていない。pageerrorは0。周辺RPC `unlock_eligible_user_cosmetics` 400、`get_chat_unread_counts` 409、`acknowledge_kpi_first_mypage_access_v1` 409を別途記録し、ガチャ・報酬の合格をこれら周辺機能の合格とはしない。

Production環境値はVercelから読み取り確認。URLは`https://api.tribe-neon.com`、Mock=false、QA tools=false。機密値は出力・コミットしない。PreviewビルドのProduction昇格は行っていない。

DNS照合で`api.tribe-neon.com`のCNAMEはProduction識別子`ktpolnkyyfkowxdmijww.supabase.co`。Vercel deploy dry-runでscratch・QAセッション・環境ファイルがアップロード対象に含まれないことを確認。

## 変更除外と反映条件

実配信基準との差分で`supabase/`、実認証・確定処理、DB運用設定は変更なし。useBattleの変更は非レイド演出時間の指定だけで、Raidには既存時間計算を維持。共有UIはRaid分岐を維持する。DB migration、Edge配信、公開フラグ、共有alias操作は実行していない。

残るテストを既存不具合・旧演出テスト不整合に分類し、今回の演出契約・関連E2E・実データ確定・Production環境の確認を根拠に反映した。全体CI成功は未取得のままで、既存の認証／Home系失敗と旧battleテストの更新が残る。大規模な無関係改修や検証無効化は行っていない。

## ロールバック

旧deployment `dpl_5aQ6LcHhifhK5wqF67x18G6QGJ2a`と固定URLを維持。反映時は直前に本番aliasの現状を再確認する。

```powershell
npx --yes vercel rollback dpl_5aQ6LcHhifhK5wqF67x18G6QGJ2a --scope kiyoshi-kitamura --yes
```

このロールバックコマンドは記録のみで、まだ実行していない。旧deploymentの固定URLは保持。復旧時もKPIのブランチ別ドメイン設定を保持し、本番3ドメインの向き先を確認する。DB/Edgeを戻す作業は今回のリリースには不要。
