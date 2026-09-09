# Raid 第4工程 親統合記録

2026-09-08 JST。基準commit `5f6da8b8cbf524bc1839de5e1828fa8ba39fae07`。A/B/C/P-04の親レビュー・機械検証完了（VALIDATED）。

## 今回の範囲

- A-04: 非公開の総合力条件・救援AND条件、難度別設定テーブル。総合力下限は初級なし・中級160000・上級200000・超級240000。救援数値は未設定NULLで後から設定可能。
- C-04: 新Migration本体のローカルSQL検証。クライアント指定値で参加/報酬権利を得る公開RPCは追加していない。
- B-04: Previewで発見した「処理中…」表示をRaid操作ボタンで抑制し、spinnerとアクセシブル名を保持する限定修正。共有OutlawButtonの未指定時の既定動作は維持。
- P-04: 仕様根拠照合、子の差分レビュー、検証再実行、Preview確認、PRと完了記録の統合。

## 親が確認した検証

|確認|結果・対象|
|---|---|
|条件判定SQL|14 PASS。PGlite 0.5.8 / PostgreSQL 18.3、無改変00251、親が再実行|
|既存共通処理|43 PASS。Node domain/controller/adapter|
|React操作|10 PASS（既存7＋追加3）。実共通UI、GameContextのみtest double、CSS描画なし|
|全体型検証・Mock build|PASS。最終差分のNext build内TypeScript検証・全ページ生成。実GameContext、既存development/mock設定、実DB接続なし|
|既存Preview HTTP|200。下記QAサンプル画面|
|既存Previewブラウザ操作|Chromeで一覧の更新→開催中Room詳細→参加者一覧→報酬ダイアログ→サンプル参加→戦闘参照確認→Room復帰を確認|

SQL詳細は [raid_room_phase4_validation.md](raid_room_phase4_validation.md)。TS一致23入力、救援AND16組などの内部反復を別テスト数として加算しない。SQLの権限検証は最小fixtureであり実環境default privileges/JWT/PostgRESTは未検証。

## 画面確認用Preview

[サンプルRoom画面](https://tribe-neon-git-codex-raid-room-rescue-20260908-kiyoshi-kitamura.vercel.app/qa/raid-room)

前工程では未確認だった既存Vercel自動連携の配信先を、PRのVercel botコメントから発見した。基準SHAのGitHub Vercel statusはsuccess、対象deploymentは `65Qyr7tcrkUHcrefcxq6JRgZuCuL`。HTTP200とブラウザ最終URLを確認。配信設定の変更・手動Deployは行っていない。PR更新に伴う既存自動配信と、DB/Edge適用を区別する。

上記ブラウザ操作の対象はB-04修正前の基準SHA相当のPreview。そこで操作中ラベルの規約違反を実測しB-04を追加した。修正版のブラウザ確認結果は後続で区別して記録する。

**サンプル画面の表示・操作を人が確認できる段階であり、見積もりで定義した「複数ユーザーで戦闘・救援・Present受取まで実機確認できるPreview」には未到達。** 実DB認証・実戦闘・報酬処理・iOS/Android実機・Human PASSは未検証。現行本番ドメインの配信SHAも今回未確認。

## 構造条件の照合と残作業

Repositoryと過去の決定履歴を照合しても、Room上限10/10/10/5の集計単位、生成資格/費用/期限/再生成、総合力判定の対象編成/時点は確定本文を確認できなかった。旧Raidの24時間・日次2エリア等を新Roomへ流用しない。

根拠: specs/raid_room_rescue_v1.md「未確認の構造条件」、raid_room_phase3_integration.md「次工程」、raid_room_api_contract.md、旧specs/spec_guild_gvg_raid.md。PR #27のコメントにも新仕様の追加提示はなく、Vercel botの配信情報のみ。

codex_parallel_protocol.mdのCanonical precedenceに従い、条件が必要なRoom生成・参加確定writerは保留。Owner/参加者待機不要、定員20、確定総合力下限を再決定する必要はない。必要なのは未確認項目を定めた既存の確定本文の所在。バランス研究・再監査は行わない。

Room生成/参加確定/戦闘接続/救援帰属/報酬・Present/旧ランキング切替は残る。総合力passedは参加許可全体ではなく、救援succeededも報酬権利作成・発行ではない。

## 完了通知

既存のPR #27更新通知が有効であることを確認した。親レビューと機械検証を通過したTaskだけVALIDATEDへ変更してPRに記録する。同一タスク・状態の再通知を避ける既存条件を維持。端末へのプッシュ配送は未検証。

## 修正版Previewの追確認（2026-09-08 JST）

対象コードSHA: `1a7b0752b0f056f2216afa820659dc8bedd79400`。GitHubのVercel statusはsuccess、deployment `7DyRRg6RR4UbdcdXzEMda7mbqz7f`。上記PreviewをChromeで再読込して確認した。

- 更新クリック中: DOMのtextContentは空、spinnerあり、aria-labelは「更新」、aria-busy=true、disabled=true。復帰後は一覧2件と更新ボタンを確認。
- 開催中Roomを開き、サンプル参加を操作。参加中のボタンは文字なし・操作名「参加する」維持・disabledを確認し、その後「戦闘への受け渡し確認」ダイアログへ到達。
- 実戦闘・報酬付与は発生しないQA fixture。実機・Human PASS、実DB接続完了を意味しない。

B-04の修正版ブラウザ操作確認を追加した記録であり、既報のVALIDATED状態を新しいタスク完了として再計上しない。生成/参加writerの仕様根拠待ちは継続する。
