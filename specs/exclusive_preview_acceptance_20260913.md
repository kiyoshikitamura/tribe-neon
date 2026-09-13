# 専用演出 Preview確認 2026-09-13

対象：3dd18ca / https://tribe-neon-1qhzjkpal-kiyoshi-kitamura.vercel.app
別ブラウザタブで既存 `/qa/battle-full-skill-load` を操作。

- 「Stress Battleを開始」からアゲハの専用スキル「ネオン・アクセル」および承認台詞「ついてきて。ここから飛ばすよ。」のDOM実表示を確認。
- 「一時停止」→「再開」ボタンへの状態変化を確認。
- このQAは固定fixtureの独自Replayタイマーを使うため、Production useBattleの実戦受入とは区別。
- QAが専用台詞1100msを待たず、装備snapshotを持たないことをコードで確認。既存QAのみ最小修正し、本人専用装備を合成fixtureへ設定、装備帯1250ms→初撃、専用1100ms→既存cutin→Outcomeへ揃えた。共通表示部品は本体と同じ。

追加したQA専用fixtureはアイテムの付与・装備・課金・DB更新を行わない。実機確認・実戦結果・全20台詞・帯cropの見え方をPASSにしていない。

次：QA修正版Previewで帯/crop/専用再発動/pauseを表示確認し、親のQA実戦を使ってサーバーsnapshotからの演出確認を別途行う。
