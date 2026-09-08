# 第20工程 E2E診断・廃止仕様への追随

2026-09-08。対象 PR #27、関連 head `58c7f1f45d229424857dd59943eb368ff2af98ab`。

## 実行対象の区別

[CI run 34198126545](https://github.com/kiyoshikitamura/tribe-neon/actions/runs/34198126545) の4 shardログをGitHubから読み取った。checkoutログが示す実行SHAは `2e8aee2219707a95fbf80252e542e5ea8ad62aa8`。これは `58c7f1f` を `314b38f170001a1d88f57e05e39e9eeb866b0dc3` へ合成した `refs/pull/27/merge` であり、開発基準 `b08e396e657615afd6dfddc05bbec37d21561a25` や head 単体の検証とは区別する。KPIのテスト本文も、CIでは `.daily-period-table`、headでは `.daily-mobile` と異なる。

各 shard は `--max-failures=2` で早期終了した。途中で中断された別テストを独立した失敗と扱わない。

|shard / job ID|結果|失敗|
|---|---|---|
|1 / 101970384398|59 PASS、2 FAIL、20未実行|QA fixture 43期待/44実測、Home banner 5期待/4実測|
|2 / 101970384423|44 PASS、2 FAIL、1中断、26未実行|KPI mobile 390/412で「日次KPI」heading不在|
|3 / 101970384483|39 PASS、2 FAIL、1中断、24未実行|ランキング4期待/3実測、認証後の日本語username不在|
|4 / 101970384491|1 PASS、2 FAIL、1中断、66未実行|Raid mobile 390/412で4位期待/CONTRIBUTION —実測|

合計143 PASS、8 FAIL、3中断、136未実行。全E2E完了・全体合格ではない。4 shardのBuildステップは成功。

## Raid変更との対応

- `main-shell.spec.ts:124` と `ranking-phase2.spec.ts` の4カテゴリ・レイド順位画面・週次順位報酬の期待は、第15工程のレイドランキング廃止と矛盾する。基準版のテストが残っていた。ランキングE2Eは当該runでは中断なので、ソースから判明した未実行の不整合として扱う。
- `raid-phase3.spec.ts:71` の「4位」は同じ廃止仕様と矛盾。`RaidTab.tsx` は本人の `get_my_raid_contribution_v1` を表示するよう変更済みだが、headの `mockRpc.ts` に同RPCがなく、Mock表示が `—` になる別の接続欠落も発見。実DB RPC SQL261の欠落を意味しない。Mock handler追加は親から別担当Cへ割当済み。

親の追加指示で、上記3 E2Eファイルに限定して更新した。

- カテゴリ数のみの期待を「総合力・バトル・ギルド」の完全一致とレイドカテゴリ不在へ変更。
- Raid Topは `CONTRIBUTION`、本人貢献 `123,456`、順位不在を検証。5人編成・HP・RP・出撃確認は維持。
- 廃止レイド画面への遷移を残存カテゴリの確認へ置換。Power/PvP/Guild報酬の既存内容検証、公開プロフィール、圏外表示、順位geometryを維持。大きな数値の折返し検証は残存総合力metricへ移す。
- PvP Dailyで現在ユーザーidentityを検証する。削除カテゴリを再表示させたり、skip・timeout延長・曖昧な許容件数には変更しない。

## 担当外の不整合・未確定原因

1. **QA fixture数**: `qaHarness.ts` は基準b08e396時点ですでに44件（`first-home-identity-loading`を含む）、E2Eは43固定。headでも当該ファイルの差分なし。Raid追加によるfixture増加ではない。
2. **Home banner**: 基準/headの `production_creatives.ts` は通常4枠を厳密に返し、Raid destinationは含まない。`HomeTab` の開催状態フィルターはbannerを追加しない。QA `first-home-raid` は開催trueを供給しているが5枚にはならない。基準にも存在する期待不整合。仕様確認なしで5枚目の製品bannerを作らない。
3. **KPI heading**: CImergeの `src/proxy.ts` は `KPI_BASIC_AUTH_USER/PASSWORD` 未設定なら503を返す。workflowのE2E env、Playwright config、起動scriptにはこの値の注入がなく、テストだけが `m3:local-only` のBasic headerを送る。認証設定不足が有力な原因。ただし取得ログにHTTP status/bodyはなく、503実測までは証明していない。API route mockはページのproxyを迂回しない。Raid変更と独立して切り分ける。
4. **認証username**: 失敗はusername「ててててて」の不在。該当テストとseed helperは基準とheadで同一。別々の `page.addInitScript` にseedと追加上書きを登録し、追加側はusersが空なら空配列を保存、seed側はそのキーがあるとreturnするため順序に依存する構造がある。ただしこのrunでの実行順序・保存状態・画面error contextは未取得で、原因確定ではない。共有GameContextにRaid差分があることも考慮し、既存不具合と断定しない。

本担当は1〜4の製品/テストを修正しない（親が明示許可したmain-shellランキング期待のみ例外）。

## 検証範囲

- GitHubログ4件の失敗内容・停止件数・checkout SHAを照合。
- 基準b08e396とheadのQA harness / Home banner定義 / 認証E2Eの差分なしを確認。HomeTabのRaid差分は救援Activity表示追加で、banner数変更はない。
- 担当3テストの差分を確認、`git diff --check` PASS。
- 対象ブラウザ再実行は未実施。親環境ではChromium取得が502で失敗しており、テスト変更をブラウザPASSとは記録しない。対象型検証・test listは親統合側の記録を参照。
- 実DB、実機、Deploy、GitHub再実行要求、merge、製品コード変更は本担当では行っていない。

## 親レビュー後のfixture補正

`raid-phase3.spec.ts` の旧Raid fixtureへ `raid_day_key` を明示追加した。SQL261に忠実なMockは旧Instanceについて同じ非null日次キーの本人ログを合算するため、キー欠落では `123,456` の期待が成立しない。fixture時刻の日付をキーに使い、本人ログのInstance参照は維持する。製品の集計条件は緩和していない。親による対象18テストの読込はPASS、実ブラウザ実行の合格とは区別する。
