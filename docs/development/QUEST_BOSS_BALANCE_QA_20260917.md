# 21ボス反映時の独立QA

## 戦闘測定

`node --experimental-strip-types scripts/verify_quest_boss_balance_simulation.mjs`

未変更の本番共通戦闘エンジンを使用。Questと同じ15ラウンド上限、プレイヤーATTACK_PRIORITY・敵BALANCED、seed 1〜100。実在キャラのLv1・覚醒0、装備・スキル未装着の比較用3編成。全新規ユーザーの配布編成を保証するものではない。

| 編成総合力 | 新宿初級 | 新宿中級 | 新宿上級 |
|---|---:|---:|---:|
| 65,160 | 0/100勝 | 0/100勝 | 0/100勝 |
| 69,650 | 0/100勝 | 0/100勝 | 0/100勝 |
| 69,560 | 12/100勝 | 0/100勝 | 0/100勝 |

合計900戦。「最初の育成の壁を新宿上級に置く」意図に対し、未装着では初級から詰まる可能性がある。総合力はHP+ATK+DEFであり、敵のスキル構成・攻撃配分なども結果に影響する。承認済み敵数値の独自補正は行っていない。バランス担当へ測定結果として返す。

## Preview DB検証

対象は `sufvuqdnqohpfzkwxohq` の明示QA `6ea6c81c-e169-457f-9206-92ff85f1495e` のみ。両テストともROLLBACK済み。Productionは未操作。

- `tests/db/quest_boss_retry_20260917_preview_rollback.sql`: PASS。新規探索の固定敵5名のステータス・キャラ・スキル参照が指定Masterと一致。初敗北でGACHAへ進み、再挑戦で新replayを生成。育成変更を反映し、敵の初期HPを保持する完全なsnapshotに戻る。追加AP・探索待ち時間は発生しない。
- `scripts/verify_quest_progression_guide_preview_rollback.sql`: PASS。入口、敗北、ガチャ→装着→再挑戦、所持資産の自動装着、資産ゼロ時の継続、再送、ストーリー既読重複防止を確認。

DBテストの敗北結果は決済経路の検査用に注入している。実エンジンの勝敗は上記ローカル900戦で別途測定。ブラウザ実機での敗北演出・タップ導線を検証したという意味ではない。
