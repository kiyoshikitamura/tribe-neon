# 第15工程 親統合記録

2026-09-08。基準SHA `52e2de76e1810cdf39ffa77f71d558fbee40cffb`。VALIDATED。

## 方針

Product Ownerのレイドランキング廃止訂正と実装継続指示を反映。個人/Guild・日次/Seasonの新規順位集計/順位報酬と製品導線を停止する。履歴・発行済みPresent、Room内参加者/貢献、他カテゴリランキングは維持。仕様書の旧記述に優先する訂正も追記し、旧仕様の再利用誤認を防ぐ。

AはSQL261、Bは製品src（GameContext限定箇所含む）、Cは停止/他カテゴリ回帰、親は契約・レビュー・統合。

## 検証

親が凍結成果物を再実行し、以下を確認。

| 検証 | 結果 |
|---|---|
| SQL261実行（PGlite） | 8件PASS |
| 実RankingTab/報酬表示（React/JSDOM） | 5件PASS |
| 既存Room画面回帰 | 28件PASS |
| 共通処理 | 83件PASS |
| Mock build | PASS |
| build後の全体 `tsc --noEmit` | PASS |
| `git diff --check` | PASS |

SQL261 SHA256: `4871b9843104f635b64f5d4800cd8d8280a8915111540ca334f00544457ac542`。
親レビュー: 他カテゴリの共有関数本文を元定義と限定照合。convergeのPvP orphan件数加算を保持する修正を確認。新規本人貢献RPCは本人限定・認証必須。旧管理resetは履歴削除/HP復活を行わない。GameContextとRaidTabは前工程成果物との差分を照合し、順位参照/導線のみの変更と本人貢献read接続を確認。

既存Raid Presentは実claim関数で受取/二重受取拒否を検証。他ランキングの日次6明細とPvP Season付与を確認。fixture/ACL/実機の限界は `raid_room_phase15_validation.md` 参照。SQL261を製品UIより先に適用する必要がある。今回は適用していない。

RAID-A/B/C/P-15を親レビュー・機械検証完了のVALIDATEDとする。HUMANPASS・全体開発完了ではない。

## 残件

討伐報酬のACTIVE期間内本人累積Damage閾値超過＋CLEAR条件の実装、成功閾値/報酬品目数量、実DB適用・実機受入・運用切替。実DB操作・Deploy・Room有効化なし。
