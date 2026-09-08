# 第16工程 親統合記録

2026-09-08。基準SHA `d63264081ca3e65bfe4f6c55eec1f5bd9d626f81`。VALIDATED。

## 実装範囲

討伐報酬: Room内本人の開催中累積Contribution Damageが設定値を超過（strict >）し、Roomが討伐成功したときにRoomごと1回。主催者/通常参加者/救援参加者を同じ条件で判定し、救援報酬とは別台帳にする。数値は未投入、設定無効が初期値。

開催中の判定はSQL256がbossロック取得後に記録する信頼済み `finalization_result.lateFinalization=false` を使う。撃破を発生させた戦闘を含める。Replayのfinalized_atは撃破時刻より後になるため、その単純な時刻比較で撃破打を除外しない。終了後確定の個人rawは既存どおり保存するが、討伐報酬の累積には含めない。救援の終了前開始・後確定を含むルールは変更しない。

既存救援報酬と共通の実装前提としてPresentへ自動送付し、送付から30日期限とする。今回ユーザーが指定した新しい報酬数量ではない。品目数量と閾値は未提示のまま設定へ分離。

A: SQL262/サーバー記録。B: 独立表示/Room内ダイアログ接続。C: SQL/画面検証。親: 契約/差分レビュー/全体検証/統合。

## 検証

親が凍結成果物を再実行し、SQL10件、討伐adapter3件、討伐画面4件、既存Room画面28件、既存共通83件（adapter追加込み86件）、Mock build、build後の全体型検証、diff checkがPASS。

SQL262 SHA256: `9560d00c2a95b06bb65acc2602841ee982bed4e706705a27dcf31b1e67dc3342`。
SQL262全文とConnectedBrowserの前工程差分、独立adapter/panelを親レビュー。既存戦闘式/確定本体/救援判定/claimを変更していない。SQL256実finalizerからtrigger/Presentまで検証し、lateFinalizationの手置きで成立させていない。実claimで本人受取・二重受取拒否を確認。同一Room本人同品目で救援/討伐が別Presentになり、再送で増えない。

追加した検証の時刻比較がPGlite clock解像度による同値で一度FAILしたため、`finalized_at >= outcome_finalized_at`へ訂正。製品のlateFinalization判定は変更せず、最終SQL10件PASSを再確認した。単純な「終了時刻未満」条件では撃破打を除外する点を検証している。

RAID-A/B/C/P-16は親レビュー・機械検証完了のVALIDATED。実DB/実Cron/複数接続/実機の代替とせず、HUMANPASS・全体開発完了ではない。詳細のfixture範囲はraid_room_phase16_validation.md。

## 残件

成功閾値/報酬品目数量の投入、実DB適用、実Cron/複数接続/実機受入、旧戦闘切替/公開。本工程では実DB・Deploy・運用有効化なし。
