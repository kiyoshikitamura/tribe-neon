# Raid結果見出し・共通RP修正

本番の確定Replay 47bd1306-4f81-4426-9634-6971d71daca6（2026-09-10 03:03 JST）は個人winner ENEMY、共有roomOutcome DEFEAT_SUCCESS、共有残HP0。個人ダメージ128,968のうち77,871を共有HPへ適用して撃破済み。SKIPで確定結果を壊したのではなく、個人勝敗のLOSEを主見出しへ流用した表示問題。

共有Room結果が確定した時点でreceiptをOUTCOME前に公開し、OUTCOME/Resultは討伐成功・開催終了・戦闘終了を表示する。個人勝敗は詳細に残し、報酬/HP/戦闘計算/Edge/DB/受付は変更しない。別Roomのreceiptを誤用しない。PvP/Quest/旧Raidの表示契約は維持。

共通Headerの資源欄にRP 残数/5を追加。既存GameContextの残数を使用し、消費/帰還時更新と連動する。狭幅は折返し可能、追加RPCやローカル推測はなし。

検証: typecheck PASS。共有撃破+個人ENEMY、開催中、期限終了の実BattleResultSummaryと帰還ボタンを375/390/430pxで9件PASS。実HeaderのRP5→2→0と7桁所持金/ダイヤを同3幅で9件PASS。fixtureはMockのみ、本番戦闘を再投入していない。JSON/画像を併記。新規Production buildの結果は配信後別記録。
