# 専用演出 Preview確認 2026-09-13

対象：3dd18ca / https://tribe-neon-1qhzjkpal-kiyoshi-kitamura.vercel.app
別ブラウザタブで既存 `/qa/battle-full-skill-load` を操作。

- 「Stress Battleを開始」からアゲハの専用スキル「ネオン・アクセル」および承認台詞「ついてきて。ここから飛ばすよ。」のDOM実表示を確認。
- 「一時停止」→「再開」ボタンへの状態変化を確認。
- このQAは固定fixtureの独自Replayタイマーを使うため、Production useBattleの実戦受入とは区別。
- QAが専用台詞1100msを待たず、装備snapshotを持たないことをコードで確認。既存QAのみ最小修正し、本人専用装備を合成fixtureへ設定、装備帯1250ms→初撃、専用1100ms→既存cutin→Outcomeへ揃えた。共通表示部品は本体と同じ。

追加したQA専用fixtureはアイテムの付与・装備・課金・DB更新を行わない。実機確認・実戦結果・全20台詞・帯cropの見え方をPASSにしていない。

次：QA修正版Previewで帯/crop/専用再発動/pauseを表示確認し、親のQA実戦を使ってサーバーsnapshotからの演出確認を別途行う。

## de395572 / cmzebwqjw 追加確認

5名の専用装備名がDOMに存在し、アゲハ承認台詞の画面表示を確認した。手動停止中に既存QAの予約済みOutcomeが進む不具合を発見。QA effectはpaused早期return前に予約timerを解除するよう修正。本体useBattleには元からcleanupがあり、同一不具合と推定しない。

短い演出を一定位置で確認できるよう、既存QA起動画面に停止位置（装備帯／専用台詞／専用cutin）を追加。共通表示のCSSを停止させ、DBや本体フローには作用しない。これは実戦の再生Authority受入を代替しない。

帯を手動停止し、5名の帯がopacityを保持することを実画面・computed styleで確認。既存cropは315px高の立ち絵のうち70pxを表示し、目元ではなくバストアップまで入るためFAIL。CSS拡大率を450%→1400%に修正した（元画像は不変、修正後の実画面は再配信待ち）。ミヤビ簪・ゴウ専用装備の黒背景は既知の透過未対応とも一致。
