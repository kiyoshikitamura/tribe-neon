# レイドUI 第5工程 統合候補・Preview適用準備

専用branch: `codex/raid-preview-candidate-step5-20260909`。ローカル統合と検証・適用準備のみ。Preview接続完了・最新本番同期済み・人のビジュアル受入完了とは扱わない。

## 固定した対象

| 対象 | 完全SHA |
| --- | --- |
| 調査時点の実Production alias配信 | 550c02225cbecb6ba6f174ee3fb952bcaae2f6dd |
| Raid第4工程 | 49222de05d0d9925beb6439c56c03a61b8564af5 |
| 完成Character同期 | 0ef8a56775c3878e4856176fb8c2d157f59d8a6d |
| 仮初期装備表示修正 | 1a38636a4d8d24ce948b1467f4da974cb17cdb3d |
| Production DB PvP hotfix canonical | 2b24b11f8e64f27391e5e09c09002c93ed7221e8 |
| Raidと採用Characterの共通祖先 | a8c31c49d63caf6f33d4cb783d3456c52e46d23b |
| 製品統合・検証対象 | 86853c6241085fc3fc2a8e46fcf25973b4e1e77e |

最終commitは本報告・検証fixture修正・証跡を含む後続commitとして完了時に報告する。製品ソースの検証後変更は行わない。

実配信確認はwww.tribe-neon.com alias→Vercel deployment `dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx` の新規読取に基づく。mainや過去Previewから推定していない。[A調査](raid_step5_a_report.md) に時点と根拠を記録。今後の配信前には再照合する。

## 採用・保留

採用: 本番のBattle Top、iPhone表示、Title/legal/crawler、KPI acquisition共通tokenとWORLD_INTRO VIEWED/SKIPPED、完成Character同期・初期装備失敗修正。Raid1–4、日次2エリア、集約/表示API、Replay/ack、参加・救援資格と報酬処理を保持。Production DBのPvP整数overflow修正はcanonical SQLと履歴をローカル保持し、外部へ再適用しない。

保留: Character作業ツリーの未commit全面改修（製品2・test1）、その後の他系統SHA。本番DB修正をフロント配信SHAと混同しない。今回の固定組合せの後続は取り込んでいない。

## 親担当の競合解消・独立レビュー

18パスのテキスト競合をhunk単位で照合。CardBattleView/useBattle/BattleResultSummary/Street系はRaid拡張を保持。競合外の本番差分も保持。GameContextは保存成功行だけを装備一覧/選択へ渡す1a38636の修正を採用し、Raid帰還情報とガチャcategoryを併存。OutlawButtonはRaid基準から不変で空loadingLabel/未指定の区別を保持。

SetupViewは本番正本と現Preview定義が対応するVIEWED/SKIPPED3行を復元。旧第4工程の「定義がないため呼ばない」というテスト前提も正本へ合わせた。新しい計測定義は作成していない。

QA gacha fixtureは自動mergeで同名定義/分岐が重複し型検証に失敗したため、フォント比較を含む本番版1個へ統合。M9は保存済み装備5件・実総合力の期待を採用し、Raid側のviewport/recovery fixtureを保持。

フォントREADMEは鉄瓶の空白差だけを整理しlicense原文/実WOFF2を保持。NOTICEは各fontの帰属とRaid側の由来を併記。zero READMEの取り込み元CRLF末尾空白はlicense原文保持として残す。台詞・ガチャ本体は変更していない。.vercelignoreは各系統の除外を併合（外部設定変更ではない）。

A独立レビュー: Raid battle/Result/raid配下は49222deから差分なし、Character製品は1a38636との差分なし、装備bootstrapは1aとbyte一致、Gacha category以降はProductionと一致。未commit混入なし。QA fixture重複なし。

## 候補上の検証

型: `npx tsc --noEmit --pretty false` PASS。初回QA重複エラーは上記修正後に再実行。

Lint: `npx eslint . --ignore-pattern 'outputs/**' --format json`、0 error / 1,901 warnings。基準0/1,865から+36。増分は採用済ソース由来で、今回の競合解消に固有の警告は確認されなかった。対象はKPI UI +2 / KPI API +10 / PvpTab +1 / QA battle flow +10 / QA battle presentation +9 / QA Status +1 / Mock +1 / M9 +1 / PvP検証script +1。内容はany 15、img 18、effect 1、未使用2。無関係な一括清掃・ignore追加はしていない。詳細はevidence内lint-comparison.json。

Mock build: `npm run build` PASS、build後の型再検証もPASS。変更検証scriptのlintは0 error / 5 warnings（browser.test.tsxの既存any5件、今回新設scriptは0）。回帰はRaid242＋shared5＋初期装備8 = 255件、Setup計測4群、ブラウザ11件（Mock Fresh1・Character8・post-loadout2）PASS。本番由来Battle/SSR/world-intro/acquisition/crawler契約もPASS。crawler初回は既定3000で接続拒否、候補localhost3017へ指定して再実行した。[C検証](raid_step5_c_report.md) には初回失敗・修正理由と再実行結果を残す。過去のPASSは候補結果へ転記しない。第4工程の実PG出力JSONは固定adapter fixtureとしてだけ使用し、新しいDB/HTTP検証と呼ばない。

## Preview適用準備と阻害要因

[適用計画](raid_step5_preview_plan.md) にSQL4本の完全名・SHA256・依存順、実Preview現定義/履歴、旧14本適用台帳、復旧・並走調整・HTTP認証→集約→日次→3役UI手順を記録。

SQL4本→postflight→対応フロント専用配信→実HTTP/UIの順。追加Edge更新は候補差分上不要。現在稼働Edge bundle同一性は未確認。今回の新規SQL作成はなし。追加でローカル採用した本番既存SQL（KPI/preopen/PvP）を未適用Raid4本へ混ぜない。履歴なしでも実反映済みがあるためdb push/全未適用applyを行わない。

具体的残件: Raid4本未適用のため現Previewでは新集約/日次/表示APIを接続できない。実HTTP認証・3役操作・実機受入は未実施。Character既報の実Fresh初期装備保存403は未解消であり、未保存装備を隠す修正だけでは保存権限問題を解決しない。実Freshを合格とするには別途原因確認・承認された対処が必要。Mock Fresh PASSで代替しない。

共有Previewはcreation/battle/rescueが全てtrue。SQL適用により新規対象が7→2へ変わるので他担当と変更枠を調整する。private schema新設競合、現関数/ACL drift、外部CI、QA資格は適用直前に確認する。前日レイド/既存24時間/報酬台帳/Replayを巻き戻さない。

人の確認: 実HTTP3役でトップ→敵選択→一覧/詳細→救援→戦闘/同Replay再読込→ack成功帰還/失敗保持→報酬Presentを確認。375/390/430pxと低高さでプロフィール往復位置と報酬最下部/close、救援識別と終了表示を操作する。Mock画像の機械・エージェント目視レビューと、人の最終受入は別とする。

push/Deploy/外部DB適用/Edge/Cron/flag/alias変更、追加ZIP作成なし。

最終追加確認: Mock buildをnext startで起動し、390×600のプロフィール往復/一覧scroll復元/モーダル1枚/報酬本文末尾とclose到達を実ブラウザで再実測PASS。今回画像20枚、主要画像を親/Cが目視。rescueとReplay/ackは今回のNode/JSDOM実source回帰で確認し、実HTTP疎通とは区別。人による最終受入は待ち。
