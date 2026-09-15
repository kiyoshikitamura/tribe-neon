# Specialガチャ 統合READ ONLY監査 — 2026-09-14
コード基準: 5a5014e74b564cf0724433d4eadf64d4a6a58530
Preview DB: sufvuqdnqohpfzkwxohq
Authority: specs/monetization_release_20260912.md、specs/special_gacha_implementation_20260913.md
状態: 確認範囲で不整合なし。修正候補なし。実機/E2E未確認。

ユーザー指示によりガチャは仕様FIX済みとして本流の統合監査へ含める。
以前の「Pool訂正表待ち」「確率未定義/データなし」という整理を訂正する。

## 実経路
5引数互換wrapper→6引数本体→draw_gacha_rarity→draw_gacha_item。
rarity重み→汎用/専用group重み→group内均等抽選。
get_special_gacha_catalogをREAD ONLY実行し、個別確率計算との一致を確認した。

| Pool | 件数 | 合計確率 |
|---|---|---|
| 正義/悪 R・SR・SSR | 10・10・4 | 65%・30%・5% |
| 秩序/混沌 R・SR・SSR | 10・10・6 | 65%・30%・5% |
| Skill 汎用R・汎用SR・専用SR | 10・15・10 | 57%・25%・10% |
| Skill 汎用SSR・専用SSR | 15・10 | 3.2%・4.8% |
| Equip 汎用R・汎用SR | 48・54 | 52%・38% |
| Equip 汎用SSR・専用SSR | 12・10 | 4%・6% |

循環小数の合計に10^-15程度の丸めあり。仕様上の確率差ではない。
- Character全50件がcanonical属性と一致。R/SRにも属性外混入なし。
- 正義/悪SSR: ゴウ・ケンゴ・コハル・レオ各1.25%。
- 秩序/混沌SSR: レイジ・アゲハ・カレン・ミヤビ・カエデ・ミオ各5/6%。
- canonical ID欠落0、rarity不一致0、専用owner参照欠落0、同一Pool内ID重複0。
- 専用判定/表示名はcanonical 2026-08-21を参照。
- SpecialはDIA/チケット、1/10連。旧混合CHAR_SPECIALは本体入口で拒否。
- Normalの既存item drawへの委譲を保持。今回変更なし。

## 未確認
実ブラウザの提供割合表示、CTAからRPC引数への投影、実ランダム抽選16条件、paid lot消費E2E。
Normal/Tutorial全動作の実回帰完了を意味しない。Productionとの差異全体の一致も断定しない。
今回の確認を実抽選PASS・ユーザー受入PASSに拡張しない。

DB/コード/資産/Production変更なし。
