# GAME03 第1段階 ガチャ正常化 実装記録

Authority: `GAME03_第1段階_ガチャ正常化_修正対応表_2026-09-11.md`

## 基準

- Base SHA: `a744f9879320310bf72d66b955e401bf0eda048e`
- Production project: `tribe-neon-prod` / `ktpolnkyyfkowxdmijww`
- READ ONLY取得: 2026-09-11 17:42 JST
- Production schema head: `20260911090000`
- 変更前snapshot: `production-before.sql`

## 変更範囲

- `gacha_items_master`のみ。
- `SKILL_NORMAL`へ`SKILL_036`〜`SKILL_050`をCanonical SSRとして15件追加。
- Equipment 34行をCanonical rarityへ再分類。
- `EQUIP_SPECIAL`からCanonical N 3件とCanonical未登録2件を削除。
- rates、Character、`SKILL_SPECIAL`、Canonical Master、item本体、user資産、RPC、flagは変更しない。

## 候補数

| gacha_id | 変更前 N/R/SR/SSR | 変更後 N/R/SR/SSR |
|---|---:|---:|
| CHAR_NORMAL | 10/17/16/7 | 10/17/16/7 |
| CHAR_SPECIAL | 5/17/16/10 | 5/17/16/10 |
| SKILL_NORMAL | 10/10/15/0 | 10/10/15/15 |
| SKILL_SPECIAL | 0/10/15/15 | 0/10/15/15 |
| EQUIP_NORMAL | 34/46/61/0 | 35/50/50/6 |
| EQUIP_SPECIAL | 0/46/61/12 | 0/48/54/12 |

## 供給差

- Normal Skill: 実SSR率 `0% → 3%`。無料10連を毎日成功利用した場合、期待SSRは7日`0→2.1`、14日`0→4.2`、30日`0→9.0`。
- Normal Equipment: 実SSR率 約`2.07075% → 5%`。同条件で7日`1.45→3.5`、14日`2.90→7.0`、30日`6.21→15.0`。
- Special Equipment変更後: SSR 7% / 12件均等、各`0.583333%`。R 55% / 48件均等、各`1.145833%`。SR 38% / 54件均等、各`0.703704%`。
- 同一gacha_idの無料・CASH・DIA・券は候補poolを共有するため、供給差は支払種別共通。

### 個別提供割合

同rarity内はweight=1の均等抽選。以下は1抽選あたりの表示rarity別・1候補あたり確率。

| Pool | 変更前 | 変更後 |
|---|---:|---:|
| SKILL_NORMAL N / R / SR | 5.000000% / 3.000000% / 1.133333% | 同じ |
| SKILL_NORMAL SSR | 候補なし | 15件が各0.200000% |
| EQUIP_NORMAL N | 34件が各1.323529% | 35件が各1.285714% |
| EQUIP_NORMAL R | 46件が各0.652174% | 50件が各0.600000% |
| EQUIP_NORMAL SR | 61件が各0.327869% | 50件が各0.400000% |
| EQUIP_NORMAL SSR | 候補なし | 6件が各0.833333% |
| EQUIP_SPECIAL R | 46件が各1.195652% | 48件が各1.145833% |
| EQUIP_SPECIAL SR | 61件が各0.622951% | 54件が各0.703704% |
| EQUIP_SPECIAL SSR | 12件が各0.583333% | 12件が各0.583333% |

移動・除外IDはmigrationの明示リストを正とする。CharacterとSKILL_SPECIALの個別割合は不変。CHAR_SPECIAL N 5件はrate行がないため0%。

## Preview Acceptance

- Preview DB: `tribe-neon-preview` / `sufvuqdnqohpfzkwxohq`
- migration適用: PASS
- 5,000抽選×6ガチャで全到達可能rarity到達: PASS
- 通常1連/10連: PASS
- 無料/CASH/既存Normal券: PASS
- 同request再送でpayload同一・再消費/再付与なし: PASS
- 券不足エラーでhistory/券/所持資産の全ROLLBACK: PASS
- Tutorial 10連・10枠目Canonical SSR保証・同request再送: PASS
- Tutorial COMPLETEユーザーの通常ガチャ: PASS
- 結果payload / Canonical / 実所持rarity一致: PASS
- JST前日claimから当日無料10連成功、当日claimへ更新、transaction rollback: PASS
- 空候補0 / 未登録0 / 実物rarity不一致0: PASS
- CHAR_SPECIAL N 5件: rate 0の別枠として保持
- ガチャ結果演出・詳細表示の静的presentation contract: PASS
- TypeScript: PASS
- Preview環境変数を用いたNext.js production build: PASS

## 復旧

`supabase/manual/20260911_gacha_stage1_rollback.sql`は、障害原因が本変更のcandidate poolにあると確認した場合だけ使う。実行前に最新pool snapshotを取得し、Stage 1適用状態と一致することを確認する。正常取得済みのuser資産は回収しない。率・RPC・Canonical・flagは触らない。
