# Room Raid バトルUI統合・Preview検証 2026-09-08

## 採用コードと配信

| 項目 | 値 |
|---|---|
| Raid照合基準 | `375a0ad642a81e9db10a9379f03e5e5f77fb4562` |
| 演出側採用SHA | `3bdefedd9b49fbbadac5ca2bbc832fe10c1b9716`（製品コード `eff2f35491efb078cf6f6495dfadadc97f071063`） |
| 統合・最終UI配信SHA | `8b7a341569206442b116e466e5ee4fed71f37ae3` |
| 固定Preview URL | https://tribe-neon-arnbhwc0s-kiyoshi-kitamura.vercel.app |
| Deployment | `dpl_7JJ87VBsfoHkE2Cdjg45EcfTjKMv` / READY / aliasなし |
| 接続先 | `sufvuqdnqohpfzkwxohq` |
| Edge | `resolve-battle` v7 / ACTIVE / verify_jwt=true |
| Edge bundle SHA256 | `b762e7c25826f9a417c87cf550388e291f2c75d0e278599e6a1d3dcd70fd8b21` |

KPI側・演出PC側と9月8日21:00–22:00 JSTの変更枠を確認し、この枠内に専用Previewへ配信・QAした。共有aliasは変更前後で一致。Edgeは互換性のある既存v7を保持し、再Deployしていない。DB migration、Cron登録、フラグ切替、push、本番変更は実施していない。

演出側のバトル表示コンポーネント・依存する表示データ・フォントとエフェクトを選択的に統合した。Raidを持たない演出側useBattle全体やWorld・ガチャ導線は置き換えていない。Raid基準SHA、演出採用SHA、競合を解消した最終配信SHAを区別する。取り込み元と対象は `import-manifest.json`、最終差分は `code-preservation.json` に記録。

## 統合時の修正

- Roomの戦闘前画面・VS・再生・SKIP・ResultにFIX済みStreet UIを接続。Roomの30ラウンド、RP表示、討伐開始・レイドへ戻る導線を維持。
- 戦闘前・VSで敵画像が欠落する点をcanonical表示マスターに接続して修正。戦闘計算・敵snapshotは変更しない。
- 開始時の古いcallbackが確定済みの参加者IDを上書きする不具合を修正。自然再生と復帰SKIPのMVP・数値不一致を解消した。
- 251dc03の再読込復帰・同一request/replay再利用・Result確認後ackを維持。ack成功後に、ユーザーに結び付けた元Room IDを画面へ渡す。ack失敗時はResultと復帰情報を保持し、帰還しない。
- feeca750の停止・報酬文言を保持。Room Resultの個人ダメージ、共有HP反映、累計貢献、残HPとPresent案内を維持。
- Result背景は敗北CSSと同じ詳細度で上書きされていた。Street Resultのセレクター詳細度を上げ、通常戦闘・Room双方に使う表示の背景画像を保持した。

`code-preservation.json` は復帰3関数をfeeca750と比較する。completeBattleResultのRoom帰還ID取得・引数追加だけを除外した比較で一致し、ack処理自体は一致する。共用DB関数378件の実定義ハッシュも不一致0件。

## 検証結果

| 検証 | 結果・証跡 |
|---|---|
| 型 / build | PASS、最終製品コードで実行。`validation/typecheck.log`, `build.log` |
| Room契約・ドメイン回帰 | 110件PASS |
| UI・useBattle関連 | 79件PASS（14+29+4+5+4+3+20） |
| 既存戦闘 | canonical runtime、full skill load、支援スキルAI選択、presentation、MVPの5スクリプトPASS |
| Result背景 | Chromium/WebKit × CSS順序2 × 勝敗2 × 通常/Roomの16ケースPASS |
| 最終Chromium実疎通 | PASS / `live-ui-final-chromium.json` |
| 最終WebKit実疎通 | PASS（Preview補助iframeの例外あり）/ `live-ui-integrated-webkit.json` |

実疎通は390×844のモバイル幅。戦闘前の双方画像→VS→5対5の再生→自然Result→再読込→同Replay復帰→SKIP→Result全文一致→ack→元Room→報酬→再読込で復帰画面なし、を検証する。各試行の開始RPCは1回だけ。復帰時は同一Replayのresolveを再利用し、追加出撃しない。両エンジンの操作ボタンは844pxの画面内に収まる。

途中版の `live-ui.json`、`live-ui-final.json`、`live-ui-integrated-chromium.json` と初回navigation失敗も証跡として残す。初回navigation失敗は開始要求なし。途中版で発見したMVP、画像、Room帰還、背景の不具合は上記修正で解消し、最終版の証跡と区別する。途中で開始した戦闘はDBを確認してから継続し、不明な開始要求を再送していない。

## QAと環境保持

今回作成したUI検証Roomは `c796086c-9596-450c-ba20-1f067c7aff9b`。主催者R0908H01、通常参加者R0908N01の専用QAのみを使用。既存19名を流用しない。HPは32,000,000から正規5戦で31,981,746へ減少したもので、今回手動HP調整はない。5件すべてack済み、request/replayの重複なし。主催者RP0、通常参加者RP2。戦闘・参加・ack以外に貢献・討伐状態・報酬台帳を直接更新していない。最終HP、開始receipt、ack時刻、参加者は `postflight.json`。

以前討伐済みのRoom `af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3` は保持。救援1件・討伐3件のPresent発行と通常画面受取・再受取拒否は前工程で確認済み（`raid_room_preview_acceptance_report_20260908.md`）。今回はその4件のCLAIMED保持を読み取り確認する。未討伐の今回Roomで両Presentを新規発行したとは扱わない。

期限確認用Room `3972a461-b45f-4b02-8142-75f294461ae3` はRoom/boss全行が変更前と一致、HP32,000,000、ACTIVE。期限は **2026-09-09 19:40:55.031663 JST**。既存監視は19:45の読み取り確認としてACTIVEのまま保持した。期限の短縮・手動失効は行わず、期限到来後に別途確認する。

既存Cron7件、migration履歴275件、共用関数378件、既存19ユーザーの全行ハッシュ、運用フラグ・報酬ルールを照合。`baseline.json`, `environment-after.json`, `environment-final.json`, `environment-comparison.json`, `edge-and-functions.json`, `postflight.sql/json`, `final-summary.json` を参照。監査中の読み取りSQLでテーブル名の誤記を訂正し、ユーザーハッシュはID一覧ではなく前回と同じ全行JSON方式で再計算して一致確認した。書き込みの再送はない。

WebKitでは `navigator.storage.persisted` の例外を3件記録した。認証なしでの再現調査で、発生stackが `https://vercel.live/_next-live/feedback/feedback.html` のPreviewフィードバックiframeであることを確認した（`webkit-error-classification.json`）。アプリ本体への修正やポリフィル追加は行わず、Preview補助機能の注意事項として残す。Chromiumのpageerrorは0件。WebKitの全疎通と再読込復帰は、この例外を抑制せず完走している。

## PCでの短い実機確認手順

1. このPCのRepositoryを開き、`node scripts/raid-room/open-preview-ui-qa.mjs` を実行。ローカルの専用通常QAセッションで上記固定Previewを開く。認証情報はZIPに含めない。
2. レイド→初級→主催者R0908H01、期限 **9/9 21:03 JST** のRoomを開く。**19:40期限の失効確認Roomは操作しない。**
3. 出撃準備で画像・RP・ボタンを確認し、討伐開始→演出またはSKIP→Resultの数値・背景・報酬案内を確認。
4. Resultのまま一度再読込し、同じ結果へ復帰することを確認。レイドへ戻る→同じRoomの報酬を確認し、再読込で未確認結果が再出現しないことを確認。

RP不足なら試行を止める。補充やQA HP変更をこの手順で行わない。iPhone/Safariの物理端末確認は別途必要であり、今回のWebKit自動検証を実機PASSとは扱わない。本番反映はユーザーの実機確認後。残件は実機受入と、9月9日の自然失効確認。

## ZIP

ZIPはPC受け取りとして、最終配信コードの変更ファイル、基点7332770からのbinary patch、レポート、機械検証ログ、画面証跡、実行した疎通スクリプト、変更ファイル一覧、ファイル別SHA256を含める。認証session、秘密鍵、`.env`、Vercel認証設定は含めない。ZIP内のREADMEに基点と配信SHAを明記する。ZIPをチャット添付したとは扱わない。
