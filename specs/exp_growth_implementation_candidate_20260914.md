# GAME03 / TRIBE NEON — EXP・成長曲線 実装候補
日付: 2026-09-14
状態: IMPLEMENTATION FIX CANDIDATE / HUMAN ACCEPTANCE REQUIRED

出典: 本流チャットでユーザーが提示した「Character / Equipment EXP Table & Growth Type Implementation Values」本文。添付MD/Excelは実行環境障害により未読。本書は提示本文の数値・制約を日本語で記録する。Productionへの反映承認ではない。

## 1. 提示されたProduction監査結果
- character_level_up_master: Lv2–100 required_material_count=1、CASH=100/level。
- equipment_level_up_master: Lv2–100 required_exp=1、CASH=50/level。
- 素材EXP: Character S/M/L=100/500/2000、Equipment S/M/L=100/500/2500。
- 60キャラの既存成長型: ATTACKER 11、BALANCED 11、DEFENDER 9、HP_TANK 9、LUCKY_STAR 9、SPEEDSTER 11。
- canonical_character_masterの各キャラlv1_* / lv100_*を端点Authorityとして維持する。
- 旧character_growth_patterns.base_* / *_gainは現端点と整合しないため、そのまま新Authorityにしない。
上記はユーザー提供の監査結果。今回の実装時監査とは区別する。

## 2. Lv別必要EXP
Target Lvへ上がるための必要EXP。成長型によるEXP差はない。

| Target Lv | Character | Equipment |
|---|---:|---:|
| 2–10 | 100 | 50 |
| 11–20 | 200 | 100 |
| 21–30 | 350 | 200 |
| 31–40 | 500 | 300 |
| 41–50 | 700 | 450 |
| 51–60 | 1000 | 650 |
| 61–70 | 1400 | 900 |
| 71–80 | 1900 | 1250 |
| 81–90 | 2500 | 1700 |
| 91–100 | 3200 | 2250 |

| Lv | Character累計 | Equipment累計 |
|---|---:|---:|
| 10 | 900 | 450 |
| 20 | 2900 | 1450 |
| 30 | 6400 | 3450 |
| 40 | 11400 | 6450 |
| 50 | 18400 | 10950 |
| 60 | 28400 | 17450 |
| 70 | 42400 | 26450 |
| 80 | 61400 | 38950 |
| 90 | 86400 | 55950 |
| 100 | 118400 | 78450 |

CASHはCharacter 100/level（Lv1→100合計9900）、Equipment 50/level（合計4950）を維持。
Equipment capは+0:50、+1:60、+2:70、+3:80、+4:90、+5:100を維持。

## 3. 成長型
中間Lvのステータス曲線だけに影響する。既存60名の割当を変更しない。

p = (L - 1) / 99
stat(L) = ROUND(lv1_stat + (lv100_stat - lv1_stat) * POWER(p, exponent))

| Type | HP | ATK | DEF | SPD | LUK |
|---|---:|---:|---:|---:|---:|
| ATTACKER | 1.05 | 0.90 | 1.10 | 0.95 | 1.00 |
| BALANCED | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| DEFENDER | 0.95 | 1.10 | 0.90 | 1.10 | 1.00 |
| HP_TANK | 0.85 | 1.10 | 0.95 | 1.15 | 1.05 |
| LUCKY_STAR | 1.05 | 1.05 | 1.05 | 0.95 | 0.85 |
| SPEEDSTER | 1.10 | 1.00 | 1.10 | 0.85 | 0.95 |

指数<1は早熟、1は線形、>1は晩成。DB masterまたはserverが参照するcanonical configをAuthorityとする。

## 4. 提示された育成速度検証モデル
Daily Rankingと一度限りの突出報酬を除く標準供給。

| 経路 | Character EXP/日 | Equipment EXP/日 |
|---|---:|---:|
| Quest | 2650 | 2830 |
| Daily Mission | 1300 | 700 |
| Raid | 500 | 500 |
| 合計 | 4450 | 4030 |

| 日 | Character | Equipment |
|---|---:|---:|
| D1 | 約Lv10 | 約Lv11 |
| D3 | 約Lv19 | 約Lv22 |
| D7 | 約Lv30 | 約Lv32 |
| D14 | 約Lv42 | 約Lv45 |
| D21 | 約Lv51 | 約Lv53 |

これはユーザー提示の検証モデルであり、新たな報酬量変更指示ではない。配分対象数等を推測して報酬やEXP値を補正しない。

## 5. DB・Runtime・既存データ保護
- Characterはrequired_exp追加/利用を優先。緊急時のみrequired_material_countへ同値を一時対応し、後でschema正常化可能。
- Equipmentはrequired_expを上記値へ更新。
- EXPアイテムのeffectValueを加算し、masterの必要EXP到達でLvUPする。素材個数=LvUPを廃止。
- 現在Lv、覚醒/LB、所有キャラ/装備、所持素材を維持。遡及EXP負債・降Lvなし。新規xp列は既存行0から。
- S/M/L混合投入、複数LvUP、CASH不足時atomic rollback、reload一致を検証。
- 9/14本流追加確定: cap超過EXPは保持し覚醒/LB後へ繰越。最終Lv100まで残り1EXPでも素材全量投入可。途中capでも蓄積可、Lv100到達後だけ使用不可。最終Lv到達時の余剰も保持する。

## 6. UI
レイアウト再設計は不要。現在Lv/EXP、次Lv必要EXP、選択素材の獲得EXP、使用後予測Lv/EXP、CASH費用、覚醒/LB上限を正しく表示する。

## 7. 受入・回帰
- Character: Lv2/10/30/50/70/100必要EXP、素材100/500/2000、複数LvUP、EXP/CASH不足処理。
- Equipment: 同Lv必要EXP、素材100/500/2500、LB cap。
- 成長: Lv1/Lv100端点完全一致、各stat単調増加、型別中間曲線差、60名割当維持。
- 回帰: 総合力、Battle stats、ガチャ新規獲得、Mission、Quest/Raid素材、CASH、覚醒/LB。
- 既存ユーザー所持EXP素材から資産影響をProduction反映前に算出。没収・補正禁止。

## 8. 順序・停止点
1. 現行強化RPC/runtime READ ONLY監査
2. Preview migration/config
3. 既存ユーザー互換検証
4. Character/Equipment強化E2E
5. Lv1/50/100 Battle stat E2E
6. Human acceptance
7. Productionは本流の別途指示があるまで実行しない

統合基準は661dfd3 + 確認済みProduction差分。今回は受入までの実装候補であり、仕様提示だけで実装済み/受入済みとしない。

## 9. 実装時に判明した割当不整合
必要EXP実装と成長曲線接続は分離。既存Release/Battleの60型割当には旧fixture UUID3名が含まれ、canonicalのレイジ/ルイ/チャンへの正式対応がない。57名だけ曲線変更せず、60名全件の対応確定後に接続。詳細はdocs/development/growth_exp_preview_implementation_20260914.md参照。
