# 第6工程補完 B：Guild外・公開範囲・拒否条件

固定配信2d2d2b1563e92f1471f9c86fa8a7cc59040ec726の専用Previewで実HTTP/UI検証。製品コード、DB定義、配信、alias、flags、Cron、HPは変更なし。親のQA分類以外は通常Auth/UI/RPCのみ。子commitなし。

## QA actor
既存password QA3役は同Guild。既存Fresh4392795bの消費済みrefreshは再利用しなかった。親許可の初回匿名Auth351cc041はstdin切断でsessionを失い、Authのみ・profile未初期化のまま保持。自分のNodeだけ終了し、経緯を本報告へ記録した。

ファイルgate自己検証後、親許可の追加1件796dfc87-d4dd-42dc-b6c2-5657334cc825（R0909OUT）を通常Auth/Setupで初期化。親が既存KPI機構でQA分類し別接続確認した後に進行。token/storageStateは保存せず同一長寿命processのmemoryで保持した。

通常無料10連、育成、おすすめ5人編成、初級クエストを完了。登録案内は正規「そのまま続ける」で匿名継続。初級は勝利、中級2回は敗北したが通常の派遣完了報酬400XPずつを受け取りLv5 EXP200/300へ到達。勝利と派遣完了報酬を区別する。初級1＋中級2、無料時短3、活力消費23（自然回復あり）。Lv5到達後追加questなし。PvP、XP直書、補充、有料時短なし。

## 実HTTP/UI結果
- Guild外から開催中/撃破済みGUILD救援はdetail403/code42501、集約cards200/0件。Activity経由で同じRoomに参加後もGUILD detail403を維持。
- ACTIVITY救援は開催中/撃破済みともdetail200/cards1。rescueId/roomId/source=activity/scope=ACTIVITY/guildId=nullを保持。
- normal専有Room513fddee-eac1-481b-8b2b-8d273131bbefで救援公開1request、ACTIVITY/GUILD各1回。同一request再送で同一publication、回数不増。
- Guild外Lv5が実Activityカード→詳細→「参加する」でjoin_raid_room_rescue_v1 HTTP200、viaRescue=true。表示「救援参加」、rescueId4be49290-8be1-48d6-af5e-110d135d5b22保持。同救援再送already_joined/viaRescue=true。Guild未所属、本人RP5→5。レイド戦闘なし。
- 前工程撃破QA Room a6940cc4-12eb-4c64-ba80-af3430134e96のActivity「撃破済み」「戦況を見る」→詳細HP0/討伐済み/参加disabled。briefing200、reason=room_ended。**終了Roomへの参加RPCは未実行。自然失効ケースではない。**
- normal Lv5/総合力78,228で中級16万要件表示。create HTTP403/code42501/message=raid power requirement、RP3→3。UI確定前ボタンは有効、押下後は汎用「作成できませんでした。時間をおいて同じ内容で再度お試しください。」で、**不足理由を伝えないUX残件**。最終撮影は既知の拒否requestIdをテスト側で固定し再送、応答mockなし。

## 証跡
outputs/raid-step6-supplement/b-summary.json が集約。b-assert-read.json は実レスポンスの機械assert結果。node scripts/raid-step6-supplement/b-assert-read.mjs PASS。
b-outsider-read.json、b-outsider-join.json、b-final-actor.json、b-outsider-ended-ui.json、b-normal-http.json、b-normal-ui-refusal.json が根拠。

主要PNGは以下6枚。実画像decode後撮影、B/親が目視。
- b-outsider-activity.png
- b-outsider-joined.png
- b-outsider-ended-card.png
- b-outsider-ended-detail.png
- b-normal-power-selection.png
- b-normal-power-refused.png

途中tutorial PNGは診断資料であり主受入と分ける。

## 残件
通常reload/resume bootstrapのPOST /rest/v1/user_equipmentsで403/code42501を実responseから再確認。b-fresh-equipment403.json。装備付与/権限拡大なし。400/404/406/409/500等の付随未分類事象もpath/statusで保存。**Fresh全体PASSとはしない。**

今回のGuild外参加と公開範囲は実HTTP/UI完了。自然失効Room、終了参加RPCそのもの、総合力不足を明示する製品エラーは未完了。秘密保存、一般ユーザーへの個別送信、既存3役所属変更なし。
