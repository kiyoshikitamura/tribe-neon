# EXP Preview実装・Season整理 — 2026-09-14
基準SHA: 8cd58f2cf51ecd970d1ec69e549cc3d3e591c771
Preview DB: sufvuqdnqohpfzkwxohq
Production: NOT EXECUTED

## EXP追加確定
ユーザー指示: 余剰EXPは保持し覚醒/LB後へ繰越。最終Lv100まで残り1EXPでもL素材全量投入可。最終Lv100到達後だけ素材使用不可。
途中Lv capではEXPを蓄積でき、解放後は素材未選択の「保持EXPで強化する」で蓄積分を適用する。
最終Lv100へ到達した投入の余剰もxpへ保持し、その後の投入を拒否する。

## 実装
- user_characters / user_equipmentsへxp bigint default0。既存Lv・所有・覚醒/LB・素材・CASH維持。
- Character required_exp追加、Equipment required_exp更新。必要EXPはDB master、素材値はcanonical item effectValue。
- 混合素材を単一atomic RPC化。素材/CASH不足は全取消。request_id ledgerで再送二重消費なし。
- Single RPC互換wrapperもEXP換算。Missionは実際の上昇Lvだけ。
- UIはget_growth_exp_masterの値で現在/使用後EXP・Lv・費用を計算。Character1経路/Equipment2経路に接続。
- Lv不変でもEXP蓄積可。CASHはmasterのLv遷移費用だけ。
- 成長指数curveは未接続。現行stat計算は変更していない。

## DB検証
Previewへgrowth_exp_authorityを適用済み（実version20260914131858、Repository20260914153000）。
適用前後のCharacter/Equipment Lv・覚醒/LB・所有、全素材数量、CASHのfingerprint一致。
既存全xp0。素材没収・遡及EXP負債・降Lvなし。
適用後にtests/db/growth-exp-authority.sqlを実DBで再実行しROLLBACK、PASS。
確認: S/M/L混合、複数Lv、quote一致、再送、payload違い拒否、途中cap保持、解放後貯蓄適用、最終Lvまで残り1にL2500→余剰2499、最終Lv拒否、CASH/素材不足atomic、所有/種類検証、旧wrapper、実Mission差Lvと再送加算なし。
UI予測コアの同一関数bodyをV8で10境界ケース実行PASS。Node脚本・TS型検査・実UIはこの時点では未実行。

## プレOPEN1位報酬表示
APIとUI fallbackの参加/2位/3位表示を除き既存rank1のみへ。
API関数置換をPreview ROLLBACKで検証: rank1_count1、他payload完全一致true。その後Previewへpreopen_rank_one_reward_projection適用済み。
Emblem本体slot・画像・既存付与・Season状態は変更しない。
通常第1Season3本と報酬欠落はformal_open_season_scope_and_reward_projection_20260914.md参照。

## 成長曲線の残件
- Release/Battleの60件は一致するが、canonicalとID一致は57名。3名は旧fixture UUID。
- migration20260823000191_remove_noncanonical_character_gacha_pool_rows.sqlが旧UUID3名をlegacy fixtureとして明記。名前だけで現在のレイジ/ルイ/チャンへ対応させない。
- canonical client JSONは旧5型×12名でDB6型割当と不一致。
- 6型指数/数式自体は60端点×100Lv×6型×5stat=18万検証PASS。正式60名割当を確定してからserver/clientを同時接続する。
- draft SQL・数式testを保存。runtime未接続、Power再計算なし。
- Power再計算は当日Ranking snapshotと首位Activityも変えるため、適用時は対象・副作用を明記する。保存済Battle/確定Ranking snapshotを勝手に書き換えない。

## 未完了・受入
Vercel Preview Build、実ブラウザでの強化→reload、覚醒/LB→貯蓄適用、Tutorial・Battle等回帰、人の受入。
実行環境停止により添付素材未読/未統合。実機確認は素材・残件とまとめる方針を維持。
Production移行前には所持EXP素材による資産影響の算出も必要。今回はProduction変更なし。
