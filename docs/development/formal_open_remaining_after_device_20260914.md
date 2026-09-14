# 正式公開 残件台帳 — 2026-09-14 実機修正後

実装基準: 91e30cb387038438d5634ff847e02fe99aaeaa28。今回の更新は消化台帳のみ。
Preview DB: sufvuqdnqohpfzkwxohq。
本流方針: 実装・Previewまで。仕様議論は別スレッド。Production反映なし。

## 完了・確認済み
- Quest初級/クリア済み表示・六本木難度順・PvP開始はユーザー実機OK。
- Raidローテーションバナーの欠落JPEGはd49ee79で無加工復旧。
- e613036でMyPage入場待機、PC Battle START配置、旧NPC直投稿403を修正。Vercel Preview build成功。ローカル環境障害によりこの最終軽微修正の実ブラウザ確認は未実施。ユーザー指定により追加実機確認依頼は行わない。
- 今回、Season Ranking通知の旧Present送付文言と表示区分の取り残しを修正。Previewのgrant_canonical_ranking_season_rewardは_grant_gameplay_reward_v1を使用。現在のseason grant行は0件。過去のPresent移動・追加報酬付与は行わず、文言は過去分にも適用できる「獲得しました」とする。
- 画像制作はユーザー指示で終了。Special画像3種維持、Shop4パック新画像は不要。

## 本番由来の統合不具合10項目 — 個別消化管理

統合仕様には10項目すべて存在したが、この残件台帳では実機指摘と直近修正に偏り、各項目の追跡行が不足していた。以下を個別タスクとして維持する。
「実装済み」「DB検証済み」「実機受入済み」を区別する。未確認は未着手/完了のどちらとも断定しない。ユーザーの「他は不具合なし」を未確認シナリオ全件PASSへ拡張しない。
参照: formal_open_integrated_release_management_20260914.md §4・§5。

| ID | 本番由来の案件 | 現在の確認範囲 | 消化に必要な確認 |
|---|---|---|---|
| BUG-01 | Skill Lv表示/旧state/不正Mission名称 | Mission名称MigrationのPreview適用記録あり。全画面除去の受入証跡は再照合対象 | Skill Lv表示0、+値のみ、Battle効果・既存進捗維持 |
| BUG-02 | Character/Equipment素材1個≒Lv+1 | EXPをPreview適用済み、DB検証・91e30cb Build PASS | 実UIの混合/予測/繰越/最終Lv/不足時取消/reload。成長型旧参照整理は独立残件 |
| BUG-03 | Room RaidのMission進捗が増えない | raid_room_mission_finalization_hooksのPreview適用記録あり | 正式1戦→進捗、retry追加0、10/50累積、clear eligibility、cancel/Tutorial除外の証跡確認 |
| BUG-04 | Guild在籍30/90日が0 | Day1のPreview実装・DB境界/再加入/再送検証済み | 実画面の在籍日数・Mission表示 |
| BUG-05 | Quest難度/初級default/cleared表示 | 暗色・六本木難度順等はユーザー実機OK | acceptedを保持。街変更・unlock等の個別受入証跡を区別 |
| BUG-06 | MyPage小Raidアイコン重複 | 統合対象。個別の実装/受入証跡を再照合 | 小Raidなし、大Raid/バナー/Activity導線維持 |
| BUG-07 | 通常Gameplay報酬がPresent経由 | gameplay_direct_reward_delivery適用記録、Ranking通知修正あり | Quest/Raid/PvP/Mission/Ranking/Login Bonusを経路別に即Bag・実資産・ledger・再送確認 |
| BUG-08 | 「アンケートのお礼」再表示 | 統合対象。Exact Source・修正差分・受入証跡を再照合 | 新規/既存/reload/Inbox/bootstrapで非表示、正規Present正常。DB行削除で代替しない |
| BUG-09 | Quest Battleに保存Partyが反映されない | quest_main_formation_authorityのPreview適用記録あり | Party変更/reload後にQuest/PvP/RaidのCharacter・Skill・Equipment5人一致 |
| BUG-10 | MyPage/Character/Profile Leader不一致 | profile_leader_authority_v1適用記録、slot1とFavorite分離変更の記録あり | 3画面一致・slot1非Leader・favorite値を強制変更しないことを確認 |

全件の実機受入完了とは判定しない。これらの消化は追加実機不具合、課金、Season、素材統合の完了とは別に管理する。

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
EXP量とは別に、既存DBの成長型60行は旧fixture UUID3件を含む。本流でユーザーが旧仕様の残骸と明示したため、旧UUIDをcanonicalのレイジ/ルイ/チャンへ継承しない。「旧UUIDとの正式対応待ち」は解除し、旧参照の除去・現canonical側の成長型整合を実装課題として扱う。57名だけ新曲線にしない。指数と数式の18万チェックはPASS、全60名runtime接続は未完了。現行client JSONも5型×12名でDB6型と不一致。growth_exp_preview_implementation_20260914.md参照。

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
公開準備完了とは判定しない。旧fixture成長型の無断継承や未確定KPI/Season規則の創作、Production公開、Season実リセット、運営告知配信は行わない。
