# 第6工程残件 — ローカル修正

基準: `648a513038284cfbcb65d3cf3a74ce02872cc9c4`。branch: `codex/raid-step6-local-fixes-20260909`。配信source `2d2d2b1563e92f1471f9c86fa8a7cc59040ec726` は変更していない。SQL再投入、外部DB適用、再配信、Production/main/alias/Cron/運用フラグ変更なし。

## A 参加条件の表示

createのサーバーcodeと既知reasonの組合せだけを製品文言へ変換し、controllerを通して既存敵選択へ接続。総合力拒否時だけ既存本人power snapshotを1回取得して必要値/現在値を表示する。取得失敗や不正値は「未確認」であり0ではない。未知エラーを条件不足と決めつけず、内部エラー本文を画面へ出さない。

参加briefingのLv不足、総合力不足、人数上限、終了、power取得失敗も具体表示へ変更。サーバー判定、閾値、再送ID、参加/戦闘処理は不変。

新規/関連domain・client・transport44件、Browser32件PASS。実RaidEnemySelectionをローカルMockで390px撮影、必要160,000/現在78,228の表示と横はみ出しなしを親も目視した。実HTTP再検証・人の実機受入ではない。

## B 保存Replayの背景

再読込復帰で画面側のoverrideが欠け、既定の別エリア背景に戻っていた。通常/復帰とも保存Replayのエリア情報を使う。日次対象・現在画面から背景を補完しない。詳細は[B報告](raid_step6_local_fix_b.md)。

既存専用QAの保存Replay metadataを読み取りで取得した [証跡](evidence/raid-step6-local-fixes/saved-replay-metadata.json) はSHIBUYA/shibuya。読み取り失敗・不明なエリアは都市を示さない中立背景とし、表示取得の問題でReplay/ack/元レイド帰還を失わせない。

取得済みresolve結果を再利用し、古い応答で保存metadataがない場合だけ本人Replayを単件取得する。表示用取得は1.5秒で中立背景へ進み、現在画面へfallbackしない。実useBattleの27件PASS、実保存metadataを使った実presenterの通常/復帰背景style一致を確認。人物を省いた背景検証用fixtureであり、実配信の全画面受入ではない。

## C 初期装備403の適用差分

原因は初期化の5件直接INSERTと、既存SQL121で意図して禁止したauthenticated INSERT権限の不整合。仮装備表示の抑止とは別件。一般INSERT権限を復活させず、GameContextを本人RPC→保存済み再SELECTへ接続した。UIと総合力は同じ保存済みrowsを参照し、各await後に認証主体を照合する。

新ローカルmigration: `20260909075933_initial_equipment_authority.sql`（Supabase CLI2.117.0のmigration newで生成）。差分はprivate付与台帳、本人用引数なし付与RPC、既存initializerの新規user分岐へ台帳登録1行。Previewの現initializer本文が最新190と一致することを読み取り照合した。既存初期化・KPI処理を古い本文へ戻す差分はない。

SQL SHA-256（LF/Git blob）: `b96719320722af8bdf18758891a078b942bcc930c91a7dc00fca011738b26125`。

対象はこのmigration後に正規initialize_current_playerで新規作成され、正規tutorialガチャと所持キャラがある本人。固定5種を原子的に付与する。台帳をロックし成功済みの再送は同じ結果、売却/reset後は再付与なし。既存装備所持なら付与をskip、既存の空所持を初回と推測しない。既存403ユーザーの救済は含めない。正規アカウント削除時の台帳CASCADE、通常resetでの台帳保持も検証した。

Characterは17:02 JSTにHEAD `91f7a7d937fbbf427bfbaada0547f38c244e9a11` と未commit差分を再確認し、全体clean・403修正なし。他系統の取り込みなし。実GameContext＋正式ローカルmigration9群、正式SQL15群、既存初期装備投影8件PASS。旧5直接INSERTの期待は、従来の「保存済みだけを表示する」意図を保ってRPC経路へ追随した。

将来の適用順は、現initializer/Character差分再照合→当migration→対応フロント。Edge変更不要。復旧は対応フロントを戻して付与RPCを停止する方針とし、発行済み装備/台帳を削除・再発行しない。旧フロントへ戻すと既知の直接INSERT403が戻るため、復旧を403解消と扱わない。今回はいずれも外部未適用で、現Previewの403は未解消。

## 自然失効と自然討伐

既存確認対象Room `3972a461-b45f-4b02-8142-75f294461ae3` は16:59 JST読取でACTIVE、32,000,000/32,000,000、outcome/cleared_at/outcome_finalized_atはnull。期限は2026-09-09 19:40:55 JSTでまだ到来していない。

`raid-room-expiry-minute` は毎分/active、16:54〜16:58 JSTの直近5実行がsucceeded。return_message「1 row」は関数呼出の応答行であり、このRoomの終了件数ではない。期限前のCron成功を自然失効PASSとしない。状態・終了時刻・Cron読取を [証跡](evidence/raid-step6-local-fixes/natural-expiry-read.json) へ保存。期限/HP変更、手動finalize、Cron実行/設定変更なし。

自然討伐は通常HPを削り切るバランス観測として残す。成立済みのHP短縮fixtureによる討伐・報酬処理検証を無効化せず、自然討伐の完走とは区別する。

## 未確認

外部適用後の実HTTP保存成功、実GoTrue再ログイン、実多接続ロック競合、reset/discard全体の結合、人の実機受入、期限到来後の自然失効、自然討伐。今回はローカル修正・検証まで。

## 親の統合検証

実作業source373ファイルの型検証エラー0。過去配信用に展開した未追跡outputsだけ除外し、製品tsconfigは変更していない。影響回帰を親が再実行し、条件/transport/client/power gate54、Browser32、Replay27、初期装備投影8の計121件PASS。加えて正式migration15群＋実GameContextとの隔離DB縦接続9群PASS。全体buildや実HTTPを新規PASSとして転記していない。

変更対象のlintはerror0、警告335（基準同対象336）、新規0。比較はrule・メッセージ見出し・対象source行の多重集合とし、React診断内の行番号移動を新規警告に数えない。無関係な既存警告の一括修正なし。

局所画像は親も4枚目視: [条件不足](evidence/raid-step6-local-fixes/create-power-390.png) / [通常Replay](evidence/raid-step6-local-fixes/b-replay-normal-390x600.png) / [再読込](evidence/raid-step6-local-fixes/b-replay-reload-390x600.png) / [エリア未取得](evidence/raid-step6-local-fixes/b-replay-unknown-390x600.png)。検証用ブラウザー/serverは終了済み。
