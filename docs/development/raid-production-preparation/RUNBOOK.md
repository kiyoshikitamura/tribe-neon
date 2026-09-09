# Raid統合候補・本番実行手順（本番未実行）

## 統合Authorityと責任

このtaskがCharacter/Raid/Cardをまとめる唯一の配信担当。別taskからの同時Deployは行わない。同projectのKPI/Preview aliasはゲーム公開の対象外。実行窓を取る際は担当者・開始時刻・完全SHA・現Deployment IDを台帳へ記録し、KPI等の別変更担当の最新状態を再確認する。今回の範囲は準備とローカルcommitのみ。

コードはCharacter 64c7d388f55bc3a3294a5281b6b12d11761ebe37に、実機受入済みRaid 3ec04503024211e720489a56f9bfa6ae7cb5c66fを三方向統合した。命中修正84a1231845a5e0a82dce91c4f37267e833c1605fはStreetBattleViewerの内容一致で包含確認。古い基準への差替えやCardだけの再分岐ではない。唯一のmerge競合はrelease_boardの履歴で両記録を保持した。

- Raid本体/route/useBattle/Profileは3ec0450と一致。
- Character画面/Equipment/Party/カード26 PNGは64c7d38と一致。
- GameContextは3ec0450にCharacterのParty下書き確定hunkのみ追加。初期装備の永続行再取得・新規付与RPC、閉じたProfileの応答破棄も保持。
- 新しいレイドバランスや報酬は提案しない。未確定値は無効のまま切り出す。
- このディレクトリを追加する最終commitが候補。完全SHAは作業完了レシートに記録する。追加のdocs-only commitでも製品tree一致を確認する。

## 固定入力

- [A: 実定義監査/依存/公開設定/SQL順](audit-a/README.md)
- [SQL原本・加工・hash一覧](audit-a/plan-manifest.json)、[配布Bundle SHA256](bundle/SHA256SUMS)
- [公開値一覧](audit-a/public-settings.json)
- [実Production/Edge/Fresh/KPI監査](release-audit/RELEASE-AUDIT.md)
- [旧Edge原本](release-audit/production-edge-source.json)、[新旧hash](release-audit/edge-source-hashes.json)
- [コード保持証跡](integration/preservation.json)

今回のローカルbuildはMock。絶対にその.nextをProductionへprebuilt配信しない。本番では固定commitから新規buildする。監査/SQL/隔離コードは.vercelignoreでweb配信対象から除く。

## 実行前ゲートと中止

1. 報酬/閾値が未確定、操作ON SQLが未固定、必要リハーサルが未PASSなら公開しない。未確定値の入力後は設定差分をhash固定し、同じ設定で隔離再検証する。
2. wwwとKPIのalias、Production DB/Edge、9分類定義hash、private schema、Cron6件、KPI最新3 migration、Quest CASH/PvP bigint、HP/master、旧未完了Replay件数、他taskの変更予定を実行直前にread-only再取得する。過去のidleは排他取得ではない。
3. drift、対象ref/host不一致、並行writer、lock timeout、必須マスター欠落、未確定値、scope外ファイル、hash不一致で中止。guardの期待値を書き換えて通さない。
4. KPI管理用aliasをゲーム配信へ割当てない。ゲーム対象projectはprj_He8QAAwvfwm74FWq2Vb8BFHCbEXb / team_ounFOJd7sfCvcytYCkExbj77。

## 実行順（将来の実行用。今回未実行）

A README記載のpsqlは秘密をログへ残さない既存認証で接続し、Production ref/接続hostを照合する。接続文字列を文書やCLI出力へ貼らない。

1. 固定Bundle hashを照合。review-apply.psqlを-v raid_commit=trueで実行し00→01→02→04を単一transactionで適用、schema reload。変数省略はROLLBACK。DB stageでも旧Raid順位発行停止が入るため、単なる無影響の事前配置とは扱わない。履歴repair/db push/8本再適用を行わない。
2. 固定commitのsupabase/functions/resolve-battle/index.ts、raid-room-route.tsと保持された依存3ファイルをセットで、Productionプロジェクトのresolve-battleへverify_jwt=trueで適用。旧LEGACYと新ROOMの両方のrouteを確認。既存認証・管理toolのdeploy_edge_functionを使い、必要5ファイルの読戻しhashで照合する。失敗時は新Roomを有効にしない。
3. 03-expiry-cron.sqlを-v raid_commit=trueで実行。既存6Cronを維持し新expiry jobを登録。job_run_detailsで実daemon成功と対象件数を確認する。
4. 固定commitの清潔なsource checkoutでProductionの既存envを照合する。NEXT_PUBLIC_USE_MOCK_DB=false、NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true、QA無効、Production API URL/site originを固定。秘密は既存Production設定を利用する。
5. Vercel CLI59.14.0の確認済みオプション例: `npx vercel deploy --prod --skip-domain --project prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb --scope kiyoshi-kitamura --build-env NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true --build-env NEXT_PUBLIC_USE_MOCK_DB=false --meta migrationSourceSha=<固定完全SHA>`。--prebuilt禁止、--skip-domainで自動aliasを抑止。実行前は同一候補のdry検査と対象project/team/envを再照合する。結果ID/URL/source SHA/build成功を記録し、www/KPI aliasが変化していないことを確認する。
6. 未公開Deployment URLでDB/Edge接続・Character/Raid/Tutorial読み出しを確認。承認済みの公開設定SQLを別hash固定し、旧生成/開始false・新creation/battle/rescue true・確定報酬のみ有効を単一運用transactionで適用する。設定SQLは現在未確定項目があるため生成/実行していない。
7. 同じprojectにKPI本番/Previewがあるため、汎用promote/rollbackを使わずゲーム2ドメインだけ切り替える。`npx vercel alias set <検証Deployment ID> www.tribe-neon.com --scope kiyoshi-kitamura`、続けて同IDを`tribe-neon.com`へalias setする。直前の全alias一覧と比較し変更allowlistはwww/apexのみ。KPI/Preview/branch aliasは不変、apex→wwwの308 redirectも保持する。片方失敗は受付OFFのまま止め、既知互換Deploymentへこの2aliasだけ戻す。
8. 実接続smoke: 挑戦→通常参加/救援→戦闘→終了→報酬発行/Present受取、再送、期限、旧開始済み確定/復帰、初期装備の通常password再ログイン、Character/枠、実Tutorial通常攻撃/スキル命中・HP/数字同期・cutin解除・SKIP非表示・Result→次会話。実接続結果と人の端末受入を別記録する。

## 復旧

- DB commit前: ON_ERROR_STOP/timeoutでtransactionを中止しROLLBACK。適用前後定義一致を確認。部分適用を継続しない。
- commit後/新Room開始後: 05-stop-new-operations.sqlを-v raid_commit=trueで実行し新規作成・戦闘・救援および旧生成/開始を止める。既存Replay/finalize/ack/Present/receipt/expiryを残す。報酬異常なら対象難度の報酬flagのみ停止し未発行対象を記録。
- Room対応DB/Edgeを維持し、既知正常な互換frontendまたは前進修正へ。旧Edgeへ単独rollbackしない。現旧Production 550c022へ戻せば全回復するとは扱わない。
- 台帳削除、HP/資産巻戻し、既存user救済backfill、RP一括返却、旧ランキング再発行は復旧手順に含めない。

## 既存証跡の扱い

Fresh実HTTP初期装備5件/GRANTED、本人再試行同5 UUID、匿名reload同UID・装備・総合力は最新Preview証跡を再利用する。過去403を現候補失敗として数えない。通常password再ログインは未確認として追加。実機レイド3ec0450のユーザー受入を保持するが、この統合候補の本番接続確認を代替しない。
