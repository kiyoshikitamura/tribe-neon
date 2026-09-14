# 正式公開 残件台帳 — 2026-09-14 実機修正後

監査基準: e61303657a8097b473cc6d17b0a9389f46eb27c5。
Preview DB: sufvuqdnqohpfzkwxohq。
本流方針: 実装・Previewまで。仕様議論は別スレッド。Production反映なし。

## 完了・確認済み
- Quest初級/クリア済み表示・六本木難度順・PvP開始はユーザー実機OK。
- Raidローテーションバナーの欠落JPEGはd49ee79で無加工復旧。
- e613036でMyPage入場待機、PC Battle START配置、旧NPC直投稿403を修正。Vercel Preview build成功。ローカル環境障害によりこの最終軽微修正の実ブラウザ確認は未実施。ユーザー指定により追加実機確認依頼は行わない。
- 今回、Season Ranking通知の旧Present送付文言と表示区分の取り残しを修正。Previewのgrant_canonical_ranking_season_rewardは_grant_gameplay_reward_v1を使用。現在のseason grant行は0件。過去のPresent移動・追加報酬付与は行わず、文言は過去分にも適用できる「獲得しました」とする。
- 画像制作はユーザー指示で終了。Special画像3種維持、Shop4パック新画像は不要。

## 残件と再開条件

| 残件 | 現状・根拠 | 次に必要な入力/作業 |
|---|---|---|
| 課金商品 | 承認済み4pack/6DIA/10DIA交換とPreview DB一致 | 商品を再作成・再適用しない |
| 課金available:false | 商品catalog不一致は除外。配信環境検証/ServiceRole照会の失敗箇所は未確定 | 対象配信環境で既存check_sandbox_environment.mjs --remote-catalog。秘密値ではなく判定結果を取得 |
| Stripe Sandbox | Checkout→戻り→受取、再送・取消等の実接続受入が未完了 | 配信環境診断完了後、Sandbox E2E。実課金を実行しない |
| Character/Equipment EXP | 必要EXP/余剰保持/最終Lv100だけ使用不可を9/14本流で確定。混合atomic RPC・xpをPreview適用済み、UI候補実装。DB rollback検証PASS | growth_exp_preview_implementation_20260914.md参照。専用Preview適用・Build・実機受入状況を区別する |
| Guild tenure | 9/14本流で加入日Day1確定。JST日付差+1をMission同期へ接続 | Preview検証結果はguild_tenure_day_origin_decision_20260914.md参照。Production未反映 |
| 売上KPI | Preview refresh_kpi_revenueも未実装stub | 別スレッドからF10–F13/PURの計上時刻、分母、返金、QA/Sandbox除外定義を回収 |
| Season切替 | 第1Season PvP/POWER/GUILD_POWERの3本、既存報酬維持で確定。日付は9/16–10/1 JST。プレOPEN1位Emblemは素材統合へ | 通常POWER/GUILD_POWER Season報酬定義欠落、interval RATE/Wins等が残件。formal_open_season_scope_and_reward_projection_20260914.md参照。実切替なし |
| ガチャPool差異 | 本流READ ONLY監査でSpecial収録ID/属性/確率/抽選関数とcatalog計算一致。欠落・重複等0。データ修正不要 | 実ブラウザの表示/CTA引数、実抽選/paid lot E2Eは未確認。special_gacha_integrated_readonly_audit_20260914.md参照 |
| 素材統合 | manifest/正規化ZIP/eye previewの3ファイル受領済み。ローカル実行環境障害で内容未読・未統合 | 環境復旧後に添付と参照先を照合して統合。実機確認は残件とまとめる |

## 成長曲線の独立残件
EXP量とは別に、既存DBの成長型60行は旧fixture UUID3件を含む。canonicalのレイジ/ルイ/チャンへの正式対応が未確認。57名だけ新曲線にしない。指数と数式の18万チェックはPASS、全60名runtime接続は保留。現行client JSONも5型×12名でDB6型と不一致。growth_exp_preview_implementation_20260914.md参照。

## 再適用禁止のPreview課金Migration対応

| Repository version | 実適用version |
|---|---|
| 20260913105839 billing_paid_pack_lots | 20260913114209 |
| 20260913111028 billing_checkout_mode_contract | 20260913114321 |
| 20260913120945 billing_dia_approved_contract | 20260913123800 |

## Authority確認の補足
- EXP: 9/14ユーザー提示の実装候補をspecs/exp_growth_implementation_candidate_20260914.mdに記録。specs/spec_progression.mdのlevel*100はPlayer用で転用不可。
- EquipmentのPRODUCTION_FROZENデータは能力倍率/Lv capであり必要EXP表ではない。
- 提案744000/93000を承認値として採用しない。素材所持数や既存Lvの補正をしない。
- Guild加入はguild_members INSERT、脱退はDELETE+last_guild_left_at更新。再加入24時間制約は維持。ログイン回数の加算cronで代用しない。
- 別スレッドでプレオープンユーザーを課金検証対象外、新規ユーザー中心とする方針が確認された。既存ユーザーの資産正常化義務や無断補正禁止を解除するものとは扱わない。
- F10–F13/PURの正式値は一般的なARPU定義から創作しない。

## 現在の制約と停止点
作業環境exec-server停止。GitHub/Supabase read-only監査とGitHub経由Preview buildは可能。対象Vercel teamへの接続は403のため配信設定診断は不可。再認証依頼を繰り返さず、この制約を明示する。
公開準備完了とは判定しない。未確定の成長型ID対応やKPI/Season規則の創作、Production公開、Season実リセット、運営告知配信は行わない。
