# 条件不足表示 — A ローカル修正

基準 `648a513038284cfbcb65d3cf3a74ce02872cc9c4`。新規挑戦時にサーバーの総合力拒否理由が汎用の作成失敗文へ消えていたため、既知の理由だけを adapter → controller →既存敵選択画面へ伝搬する。既存レイド参加時の汎用文も、briefing の判定理由から具体表示する。

変更: `raidRoomJoinPresentation.ts`（新規純粋表示 helper／型付き拒否）、`raidRoomRpcTransport.ts`、`raidRoomClient.ts`、`RaidRoomBrowser.tsx`。GameContext/useBattle/SQL/権限・参加判定・戦闘・報酬は変更しない。

- Lv不足は「プレイヤーLv5以上が必要」。現在Lvの取得契約はないため現在値を捏造しない。
- 総合力不足は必要／現在を表示。参加画面はサーバー briefing の両値を使用。新規挑戦はサーバーが `42501 / raid power requirement` を返した後だけ、既存 `get_my_power_snapshot` を一度呼んで現在値を補完する。新規挑戦の必要値は現在の canonical 難易度設定（16万／20万／24万）。クライアントで再判定しない。
- 同 snapshot RPC は既存の power projection refresh を伴う取得 API。今回外部へ実行しておらず、テスト double で呼出回数を確認した。
- 総合力未取得・読取失敗・不正値は「未確認」。unknown 判定から不足を断定しない。定員／受付終了／日次対象変更も区別する。任意のサーバーエラー本文は表示しない。
- 既存 create の同 request ID 再送、停止判定、disabled 条件は保持。

検証（今回実行）: 新規 helper／adapter/controller を含む44件 PASS、実 Browser React/JSDOM 32件 PASS（追加3件は Lv不足・総合力不足・unknown の表示と disabled／register0 を確認）。`git diff --check` PASS。全体型検証は親担当。

[390px 局所画面](evidence/raid-step6-local-fixes/create-power-390.png)を保存・目視確認。実 RaidEnemySelection、既存 CSS／素材を使い、GameContext だけ double にした静的ローカルページ。外部 network を遮断。横はみ出しなし、画像 decode 成功、必要160,000／現在78,228 が2行に収まり読める。全アプリ／実 Preview の受入ではない。

再現 script: `scripts/raid-step6-local-fixes/a-visual.mjs`。新規機械テスト: `tests/raid-room/requirement-presentation.test.mjs`、既存 browser.test.tsx へ3ケース追加。外部 DB／Deploy／alias 操作なし、子 commit なし。
