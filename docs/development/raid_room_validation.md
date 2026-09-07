# レイドRoom検証手順

対象: RAID-C-01。正本: `specs/raid_room_rescue_v1.md`。
この初回成果は、総合力条件と表示契約の純粋関数を検証する。Roomの実装完了、実DB検証、Preview到達、実機PASSを意味しない。

## 今回の実施結果

2026-09-08の作業記録。対象は同一作業領域のRAID-A-01/B-01成果。統合SHAは親が記録する。

| 検証 | 結果 |
|---|---|
| 独立した参加下限・表示期待値、未取得・不正入力 | Node v24.19.0で26テストPASS、FAIL/skip 0 |
| 新規2ファイルのstrict TypeScript検証 | TypeScript 5.9.3でPASS |
| Repository全体のlint/typecheck/build | 未実施。今回の作業領域は対象ファイルのみ |
| DB接続・DB書込み・Edge呼出し | 未実施 |
| Preview Deploy・ブラウザ・実機確認 | 未実施 |

実行コマンド（Repositoryルート）:

```sh
node --experimental-strip-types --test tests/raid-room/*.test.mjs
```

TypeScriptはRepository依存を変更せず一時領域に導入して、次の設定で実行した。
通常のcheckoutでは既存のTypeScript実行ファイルを使って同じ引数を渡す。

```sh
tsc --noEmit --strict --target es2017 --module esnext --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck src/domain/raidRoom.ts src/domain/raidRoomPresentation.ts
```

テストの期待値は実装定数から自動生成しない。初級制限なし、中級160000、上級200000、超級240000の独立値を使う。中級以上で下限直前・一致・直後を確認し、推奨値を参加下限に流用していないことを確認する。
初級の総合力ゲート通過は、Room状態・RP等を含む参加資格を意味しない。

## 後続の接続検証

以下は実装・API・構造条件が揃った後の検証手順であり、今回のPASSに含まない。

| 接続対象 | 確認内容 |
|---|---|
| 参加API | サーバー判定の下限直前/一致/直後。未取得・不正値を参加可にせず、UIの推奨値とも区別。判定編成・判定時点は確定仕様を使用 |
| Room操作 | Owner開始→一覧→参加→即戦闘→更新→終了。定員20の境界。生成資格・上限集計範囲・費用・期限は確認済み契約に従う |
| 救援導線 | Activity/Guild Chatから同じRoomへ遷移。終了済み・取得失敗時の表示。救援経由の帰属はサーバー記録で照合 |
| 救援成功 | 救援経由・必要戦数・必要Contribution・CLEARの各条件を一つずつ満たさない場合と、全て満たす場合。仮置き数値は設定からfixtureへ入力し確定値と呼ばない |
| 共有HP・再送 | 2ユーザーの確定、討伐競合、再送でHP/RP/報酬が二重反映されない。期限後確定は確認済み契約で判断 |
| 参加者・Guild | Room単位でユーザーが重複しない。現在所属と戦闘Snapshotを混同しない。未取得と所属なし/参加0件を区別 |
| Result・Present | サーバー結果と表示が一致。成功者の報酬が一度だけ発行・受取される。既存日次/Season報酬と新報酬の区分を照合 |

既存資産の再利用候補:

- UI: `tests/e2e/raid-phase3.spec.ts`、`tests/e2e/ranking-phase2.spec.ts`、`scripts/run_browser_e2e.mjs`。
- 戦闘再生・集計: `verify:tn09a-raid-playback-liveness`、`verify:tn09-raid-ranking`、`verify:ranking-reward-regression`。
- Preview実DB: `scripts/verify_official_raid_preview.mjs`、`scripts/verify_canonical_raid_lifecycle_preview.mjs`。
- RankingローカルDB: `scripts/run_local_ranking_lifecycle_test.mjs`。localhost専用の制約を維持する。

旧テストの「日次2エリア・5分respawn」等を新Roomの仕様として流用しない。変更が必要なassertだけを正本仕様へ合わせ、無関係なテストの拡大やバランス研究は行わない。

## Previewと実機

Previewの実DBテストは、アカウント作成、戦闘、HP変更、報酬付与を伴う**書込み検証**である。READ ONLYと呼ばない。親が対象環境と適用順を管理し、Productionを接続先にしない。現在の親子タスクでは環境操作を実施しない。

実機確認は、完成した同一Preview SHA/DB/Edgeを対象に、少なくともOwnerと救援者で一連の操作を行う。iPhone Safariを中心に、390×844/412×915相当の横溢れ、戻る、更新、連打、離席後復帰、報酬ダイアログとPresentへの遷移を確認する。自動ブラウザ確認と実機確認は別に記録する。

戦闘の長さ・討伐の手応え・報酬感は実機後の調整欄に記録し、事前に網羅的な数値検討を再開しない。

## 報告と担当境界

子Cは新レイド専用テストと手順を担当する。API/DB/Edge/マスターの問題は子A、UI/Context/Mock本体は子Bへ証拠付きで返す。共通runner、package、CI、環境設定は親の排他割当なしに変更しない。

報告には対象SHA・環境・コマンド・PASS/FAIL/未実施・再現手順・未確認点を含める。`IMPLEMENTED`、`VALIDATED`、実機PASS、Release判断を区別する。
