# 第12工程 親統合記録

基準SHA: `8f6828fe697bfa3ab1b34b69f3818dd2fbd19f8b`。2026-09-08。状態VALIDATED（親レビュー・機械検証完了、Human PASSではない）。

## 承認内容と担当

救援依頼はRoom作成者から全体Activityと依頼時のGuild Chatの両方へ送り、各公開先でRoomごとに最大3回。通信再送は回数に含めない。救援リンクから初めて参加登録したユーザーの登録後確定戦数・Contribution Damageを集計する。作成者・既存通常参加者を救援へ変更しない。

AはSQL259/API、Bは製品Room・Activity/Guild Chat導線、CはPGlite/画面検証、親は仕様記録と差分レビュー・統合を担当。

## 実装上の扱い

Guild未所属ならActivityのみ。Guild移籍でGuild Chatの回数をリセットしない。片方の回数上限に達した場合は残りがある公開先へ投稿する。両方の上限に達した場合は追加依頼不可。

Guild救援投稿は通常発言に付随する経験値・ミッション・KPIの対象にしない。既存のsystem投稿判定を利用する。

## 検証

親が差分をレビューし次を再実行した。

|検証|結果|
|---|---|
|PGlite実SQL250〜259、救援回数/帰属/確定集計/AND|12件PASS|
|共通domain/controller/adapter/Edge route|76件PASS（救援adapter4件を含む）|
|Room React操作|22件PASS（救援追加2件を含む）|
|実useBattle回帰|17件PASS|
|全体Mock build|PASS、静的生成13ページ|
|最終全体TypeScript|PASS|
|git diff --check|PASS|

SQL259 SHA256: `4088d5f8c869ff8db3bd26faf95e3dfdf0250cd404ea2588e639b79397e7691f`。

親レビューでACTIVEかつoutcome未設定のCLEAR入力をfalseへ正規化。閾値未設定のunknownは維持した。検証fixtureのavatar_url不足と既存関数の返却status/SQLSTATE期待を修正し、最終値で再実行した。

既存チャットEXP/mission/KPI/human responseのsystem投稿除外条件とuser_id単位集計をソース照合。製品チャットのselect(*)で救援IDを受け取り、system投稿にもリンクを表示することを確認。controllerで救援リンク参加と通常選択への復帰を検証した。

PGliteは単一接続でAuth/マスター等の既存fixture doubleを利用。Reactはjsdom/通信double。全体buildはMock設定。実DB・実HTTP/Realtime・複数接続・ブラウザ実機の一連確認ではない。詳細はraid_room_phase12_validation.md。

救援依頼UUIDの保持は同じ画面での再試行まで。再読込を跨ぐ永続化は未実装。成功receipt表示後の次操作は新規依頼として数える。

## 残件

本工程は救援依頼・帰属・貢献参照まで。報酬の品目・資格詳細とPresent発行、ランキング切替、実DB・実機の一連確認は別途残る。救援成功の数値設定は暫定候補と確定値を区別する。作成/戦闘の運用フラグは無効を維持する。
