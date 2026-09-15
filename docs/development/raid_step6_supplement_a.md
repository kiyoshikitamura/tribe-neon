# 第6工程補完 A — 実 UI 新規出撃・RP 検証

2026-09-09、固定 Preview `https://tribe-neon-gcg8o8bcu-kiyoshi-kitamura.vercel.app`（配信 SHA `2d2d2b1563e92f1471f9c86fa8a7cc59040ec726`、Preview DB `sufvuqdnqohpfzkwxohq`）で実施。証跡基準 `b8ad912782f49fb6a58eef4f12b0cea95856e4f0`。Mock/ローカル代用ではなく Chromium 390×844 の実 UI と正規 HTTP、別接続の read-only SQL を突合した。物理端末の受入ではない。

## 実行対象と結果

- 専用 QA normal `25975265-f042-4dd1-8ffc-a12f8414a035` を単独使用。
- 正規 create RPC で新 Room `513fddee-eac1-481b-8b2b-8d273131bbef`（`RAID_SHIBUYA_V1`、normal 主催）を作成。create request `5e8c0dee-51eb-4a98-9f97-d1f61a63d3fc`。HP 短縮・DB 直書きは行っていない。
- 詳細の「出撃準備」→ SETUP の「討伐開始」を実際にクリック。SETUP まで start RPC 0 件、クリック後 1 件。認証以外の localStorage 注入は行っていない。
- start request `3ce0079f-7fc9-4348-a128-e71e55c4c896`、Replay `b481f2d7-80db-425f-9786-123ae7d4f9f8`。
- 実戦闘→ Result →ページ再読込→サーバー復帰の同 Replay→「レイドへ戻る」→ ack 成功→元 Room 詳細へ帰還 PASS。
- 個人結果は敗北、与ダメージ／共有 HP 反映 4,995、Room は開催中、残 HP 27,995,005 / 28,000,000。撃破・報酬発行の試験とは区別する。

## RP と冪等性

初回無料使用済み。開始直前 07:10:13.767Z の RP 4 →開始直後 07:10:15.444Z の RP 3。receipt の `cost_type=RAID_POINT`、`cost=1`、残 RP 3。SQL260 の開始時消費仕様と一致。

同じ保存済み payload/request を正規 HTTP で 1 回再送し HTTP 200、同じ Replay、RP 3。Result 前、同 Replay 再読込後、ack 後も RP 3。回復起点 `2026-09-09T05:18:54.994456Z` は全観測点で不変であり、自然回復による差分は発生していない。

別接続 SQL でも対象 actor/Room の開始要求 1 件、Replay FINALIZED、cost 1、`recovery_acknowledged_at=2026-09-09T07:11:50.162332Z`、残 RP 3 を確認。UI resolve は同 Replay へ 2 回、UI start 1 回、UI ack は対象 request 1 回。旧 Room／旧 pending は触っていない。

## 証跡と目視

- [実 UI 記録](../../outputs/raid-step6-supplement/a-ui-start.json)
- [別接続 DB 確認](../../outputs/raid-step6-supplement/a-db-confirmation.json)
- [作成記録](../../outputs/raid-step6-supplement/a-room.json)
- [出撃準備](../../outputs/raid-step6-supplement/a-setup.png)
- [Result](../../outputs/raid-step6-supplement/a-result.png)
- [同 Replay 再読込 Result](../../outputs/raid-step6-supplement/a-result-reloaded.png)
- [元 Room 帰還](../../outputs/raid-step6-supplement/a-returned-room.png)

出撃準備の味方・敵・編成画像、Result の MVP、帰還後の主催者／敵画像を保存画像で目視確認した。Result と帰還画像は img decode と naturalWidth 確認済み。初回 SETUP 撮影だけ旧 CSS selector で画像集計 0 件だったため機械的な画像ロード PASS とはしない。保存 PNG では全人物画像表示を確認済み。再実行用 script は正しい `.raid-battle-setup` と非空／全 img ロード assertion に修正した。追加出撃はしていない。

初回試行は遅れて表示された「ギルドへようこそ」に阻まれ、start/resolve/ack 全 0 で停止。[失敗記録](../../outputs/raid-step6-supplement/a-ui-start-first-attempt.json)を保存し、当該ダイアログの正規「閉じる」だけ locator handler で処理して同 Room を再試行した。その他通知の一括承諾や強制クリックは行っていない。

## 残件・引渡し

同 Replay の再読込前後で Result の背景が渋谷から別の夜景に変化する。MVP・ダメージ・残 HP は一致しており、機能結果と表示一貫性を分離する。再読込 Result の戻る操作は最初の viewport 外だが通常スクロールを伴うクリックで成功した。ビジュアル全面受入の PASS にはしない。

07:12Z 頃 browser/context を閉じ、normal と新 Room の救援公開操作を B に引き渡した。以降 A は normal の追加操作を行わない。製品コード・配信・DB 権限／DDL・マスター／報酬条件／他 Room HP・旧 Present は変更していない。

## 追加読取調査 — 新 Guild 外 QA の Lv5 正規到達

Lv1/XP0 から Lv5 の通常必要 XP は 100+150+200+250=700。SQL179 の canonical level master と Preview 実 SELECT が一致した。

最短候補は正式 PVP の初回 1 戦確定。SQL147 `on_official_battle_funnel()` は PVP_SERVER の FINALIZED 遷移時、`first_pvp` 未記録で Lv5 未満なら不足 XP を計算し `apply_user_xp` で Lv5 に到達させる。勝敗条件はない。Preview 実関数全文と `official_battle_funnel_trigger` の enabled=`O` を読み取り確認した。PVP_PRACTICE/NPC 練習は対象ではない。

SQL176 `start_pvp_battle` の正規消費は PVP ポイント 1、開始関数に Lv5／Guild 所属条件はない。対戦相手は正常な防衛編成が必要。対戦相手の順位等にも通常の影響があるため、既存専用 QA 相手を使うことを親／B へ提案した。実行は担当判断とし A は外部 write を行っていない。

代替は SQL210 の正規 quest。EASY 100XP・活力3・5分、NORMAL 400XP・活力10・60分（同 area EASY 初回クリアで解放）。EASY→NORMAL→NORMAL の 3 回で900XP・活力23となる。SQL181 の `complete_patrol_instantly` に日次無料5回があるため未使用なら3回分で待機を短縮可能。各回の正規 battle 解決と `claim_patrol_rewards` は必要。課金通貨消費や進行強制は不要。現在の既達 XP、初回 PVP 記録、資源残量、チュートリアル/UI 通行状態は B が actor の実状態で確認する必要がある。
