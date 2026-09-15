# 第20工程 最終親レビュー — VALIDATED

2026-09-08。RAID-A/B/C/P-20の担当範囲を親レビュー・機械検証完了。全CI合格・新Room実機受入・開発全体完了ではない。以下が最新判定で、後段は時系列の診断記録。

## 確認結果

- head aef63eb424a00bd7739f6db6fdabe301b13442cc、Quality run34201260481。CI checkoutは合成ed99a9548d5a4e60d829ec74c7d61c83f58cf3d2（base314b38f + head aef63eb）。
- 独立raid-regression job101980329709: Mock6件、build、ブラウザ18件PASS（49秒、retry0）。Room UI falseの旧画面貢献/順位廃止/残るカテゴリとshellの検証。
- 通常CI: lint0errors/1836warnings、型PASS。head単独の既報ローカルlintは1837warningsで、合成treeとは区別する。
- First Home検証の旧RPC直接呼出し要求を修正。親は実ソースを照合し、更新スクリプト全assert・activity-cutover4件・対象eslint PASS。7都市背景はheadのgit blobを取得しasset検証も実行。その他assertは維持。
- npm集約verify:tutorial-first-homeは、変更していないStarter Skill iconのsparse未展開によりローカル停止。集約全体のローカルPASSとはしない。変更のないparity3種は直前CIでPASS。
- 既報の戦闘復帰17、Activity14/Clear4/Room28/切替3と親型/Mockbuildの結果を保持。設定生成11件も再実行PASS。

## 残件

広域4shardは189PASS/8FAIL/2interrupted/91未実行。presentation fixture数・旧Homeバナー数、KPI2件、認証3件、Home CTA1件。原因未特定のものを既存不具合と断定しない。追加静的検証のremote CI結果も追跡する。

独立Preview接続、4難度の救援/討伐閾値・報酬品目数量、実DB適用/Edge接続/実Cron/多接続/実機は未完了。既存手順と未入力設定templateを利用し、バランス研究を追加しない。本番/DB/手動Deploy/運用有効化なし。

証跡: https://github.com/kiyoshikitamura/tribe-neon/actions/runs/34201260481/job/101980329709

---

# 第20工程 最新の親検証

A-20/C-20はVALIDATED。B-20/P-20は訂正版ブラウザCI結果の確認待ちで、第20工程全体はIN_PROGRESS。

開始処理を同ファイルのトップレベルrunBattleStartへ移した。親もASTで元の107文（53,372文字）がcontext代入を除いて完全一致することを確認し、引数順・79依存の受渡し・アカウント取消のlayout effect化をレビューした。最終的に復帰/guard等の試行helperは残していない。

親最終検証: 通常全体lint **0 errors / 1,837 warnings**（除外追加・rule緩和なし）、全体型、Room flag trueのMock build PASS。戦闘復帰17件・Activity14件PASS（StrictMode/破棄後応答の1件を追加）。BのClear4/Room28/切替3、CのMock6、順位撤去React5もPASS。KPI検証のローカル識別子変更も既存検証PASS。

独立CI初回はRaid画面6件を含む11PASS、カテゴリ期待順序2FAIL。RankingTabの正しい順序「総合力→ギルド→バトル」へ期待を訂正し、次のCIで再確認する。先行CI全体の失敗を解消済みとはまだ扱わない。

実DB・実機・独立Preview接続・設定値投入は未実施。全体開発完了ではない。

---

# 第20工程 CI回帰修正・検証中

2026-09-08、開発基準head 58c7f1f45d229424857dd59943eb368ff2af98ab。

## 変更と親レビュー

Phase15で廃止したレイド順位を期待するE2Eが残り、本人貢献RPCもMockに存在しなかった。Bは3つの既存E2Eを現仕様へ更新、CはSQL261に対応するMock参照を追加した。順位を復活させず、本人rawの集計と残存3カテゴリ・報酬・プロフィール・配置検証を維持する。

親はSQL261とMockの本人/RoomInstance/旧日次キー分岐、他ユーザー除外、変更したE2Eの具体的期待を確認した。Raid fixtureの欠落した日次キーを補正。Aはlint OOMを調査し、useBattleのReact Compiler解析で現行4GB/6GBとも失敗、基準b08e396は通常4GBで完走と確認。Room追加経路の構造分割による修復を継続中。製品のlint除外やルール緩和を行っていない。

## 機械検証

- 本人貢献Mock: Node6件PASS（親再実行）。
- 既存順位撤去・他カテゴリ: React5件PASS（親再実行）。
- 全体TypeScript: PASS。
- 対象E2E3ファイル: 18テスト読込PASS。ブラウザ実行のPASSではない。
- git diff --check: PASS。
- ローカルChromium取得: CDN502/timeoutで失敗。実機やブラウザの合格として補完しない。

親はQualityに独立raid-regression jobを追加した。Mock6件と既存3ファイル18ブラウザテストを実行し、広域E2Eが先に打ち切られても本差分を確認できるようにする。Room UIフラグfalseの旧画面における順位廃止/本人貢献の回帰であり、新Room実DBの一連受入とは異なる。既存Quality/Edge/広域E2Eを削除・無効化せず、Release Gateを置き換えない。初回CIはRaid画面6件を含む11件PASS、カテゴリ期待順序の誤り2件FAILで打切り。親がRankingTabの総合力→ギルド→バトルと照合して訂正。訂正版は再実行待ち。

## 状態と残件

RAID-C-20は親レビュー・対象機械検証済み。RAID-B-20はブラウザ検証待ち。Aの診断完了はlint復旧完了を意味しない。第20工程全体はIN_PROGRESS。

実機確認可能Preview・全体開発完了ではない。報酬/成功条件値、独立Preview DB/Edge/UI、実Cron/多接続/実機受入が残る。最新head58c7f1fのGitHub Vercel statusは2026-09-08 16:12:08 JST successだが、実DB接続確認を代替しない。

先行CI run34198126545は合成merge2e8aee2（親314b38f+58c7f1f）を検証しており、head単体や開発基準b08e396とは分ける。失敗はlint OOM、廃止順位期待、基準からあるQA件数/バナー期待、KPI/認証の未確定原因。詳しくはraid_room_phase20_lint.md / raid_room_phase20_e2e.md / raid_room_phase20_mock.md。

実DB操作、手動Deploy、merge、運用フラグ有効化は行っていない。

## 通常lintの追加修正

useBattleを除く診断実行で7エラーを確認。Room関係6件はrender中のref更新で、BがlayoutEffect/commit後のlifecycle管理へ修正した。アカウント切替と古い応答の保護を維持する。詳細raid_room_phase20_refs.md。

残る1件は既存KPI検証スクリプトの変数名moduleに対するNext lint。親がloadedModuleへ名前だけ置換し、既存KPI検証をPASS。製品KPI集計・認証は変更しない。この診断でuseBattleを除いた結果を通常lintのPASSとは扱わない。
