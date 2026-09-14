# 正式公開 残件台帳 — 2026-09-14 実機修正後

今回再開の基準: 9eb5083839ec71bcabc2e7eaed0a613faa56d1a8。追加の実装・検証はformal_open_bug_consumption_progress_20260914.mdを参照。
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
| BUG-01 | Skill Lv表示/旧state/不正Mission名称 | ソース407・SQL445全文監査で表示/旧Client state残存0、SQLaliasは進捗互換用 | 実機で+値表示とBattle効果を確認。formal_open_bug_01_06_08_code_audit_20260914.md参照 |
| BUG-02 | Character/Equipment素材1個≒Lv+1 | EXPをPreview適用済み・DB検証PASS。成長指数も現在のcanonical60割当維持で接続しserver/client360ケース一致 | 実UIの混合/予測/繰越/最終Lv/不足時取消/reload、成長後Battle |
| BUG-03 | Room RaidのMission進捗が増えない | 正式finalize50回・Daily/累計10,50・全retry/late/cancel/非Raid/clear資格を実DB検証PASS | 実画面Mission反映。raid_mission_guild_tenure_live_audit_20260914.md参照 |
| BUG-04 | Guild在籍30/90日が0 | Day1のPreview実装・DB境界/再加入/再送検証済み | 実画面の在籍日数・Mission表示 |
| BUG-05 | Quest難度/初級default/cleared表示 | 暗色・六本木難度順等はユーザー実機OK | acceptedを保持。街変更・unlock等の個別受入証跡を区別 |
| BUG-06 | MyPage小Raidアイコン重複 | 現行ソースで小Raidなし、大Raid/Banner/Activity維持を確認 | 実機で導線保持。追加のコード修正なし |
| BUG-07 | 通常Gameplay報酬がPresent経由 | PvP AFTER Triggerの配送漏れを修正しPreview適用、Resultへ実receipt表示。6経路の直接付与/再送/Present増0をDB検証PASS | 新PvP Result実画面と6経路統合受入。bug07_gameplay_direct_reward_reaudit_20260914.md参照 |
| BUG-08 | 「アンケートのお礼」再表示 | 現行全ソースでp_swr/survey/該当placeholderなし。正規Presentを削除・フィルタしない | 新規/既存/reload/Inbox/bootstrapの実機受入。コード監査と実機PASSを区別 |
| BUG-09 | Quest Battleに保存Partyが反映されない | コード/DB Main Authority一致、保存5名→READ ONLY snapshot5名/slot順/Skill・Equipment fields一致 | Party変更/reload後のQuest/PvP/Raid実戦一致。quest_party_leader_authority_audit_20260914.md参照 |
| BUG-10 | MyPage/Character/Profile Leader不一致 | Favorite参照とslot1先頭表示をコード/DBで確認、既存favorite/slot1の相違は正常 | MyPage/Character/Public Profile実画面一致 |

全件の実機受入完了とは判定しない。これらの消化は追加実機不具合、課金、Season、素材統合の完了とは別に管理する。

## 残件と再開条件

| 残件 | 現状・根拠 | 次に必要な入力/作業 |
|---|---|---|
| 課金商品 | 承認済み4pack/6DIA/10DIA交換とPreview DB一致 | 商品を再作成・再適用しない |
| 課金available:false | 商品catalog不一致は除外。配信環境検証/ServiceRole照会の失敗箇所は未確定 | 対象配信環境で既存check_sandbox_environment.mjs --remote-catalog。秘密値ではなく判定結果を取得 |
| Stripe Sandbox | Checkout→戻り→受取、再送・取消等の実接続受入が未完了 | 配信環境診断完了後、Sandbox E2E。実課金を実行しない |
| Character/Equipment EXP | 必要EXP/余剰保持/最終Lv100だけ使用不可を9/14本流で確定。混合atomic RPC・xpをPreview適用済み、UI候補実装。DB rollback検証PASS | growth_exp_preview_implementation_20260914.md参照。専用Preview適用・Build・実機受入状況を区別する |
| Guild tenure | 9/14本流で加入日Day1確定。JST日付差+1をMission同期へ接続 | Preview検証結果はguild_tenure_day_origin_decision_20260914.md参照。Production未反映 |
| 売上KPI | 公開後残件へ移動。集計完成はリリース必須Gateにしない | 計上・返金・分母・除外定義を別途確定。購入・付与・返金記録の保持と照合は課金受入で確認 |
| Season切替 | 3カテゴリとも正式オープンと同時開始。終了10/1 00:00 JST維持。Season報酬MD/XLSX全Tier一致 | 開始契約・全9Tier/16名誉報酬・連続7日在籍・所持/表示をPreview適用。cutoffと月次runnerの運営接続、実機受入は残る。実切替なし |
| ガチャPool差異 | 本流READ ONLY監査でSpecial収録ID/属性/確率/抽選関数とcatalog計算一致。欠落・重複等0。データ修正不要 | 実ブラウザの表示/CTA引数、実抽選/paid lot E2Eは未確認。special_gacha_integrated_readonly_audit_20260914.md参照 |
| 素材統合 | ローカル復旧・添付読取済み。承認18PNGを無加工格納、目元10点をcanonicalへ接続 | 承認により都市7種を新規登録し既存8種を保持。Preopen1位画像も接続。実機確認は残件とまとめる |

## 成長曲線の実装状況
旧fixtureの対応待ちは解除。現在のcanonical JSON60名の既存割当(5型各12名)を維持し、6型指数をserver/clientへ接続。任意の型再配分なし。360ケースの一致、current Power整合をPreviewで検証済み。実UI受入は残す。

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

## ユーザーへ依頼する未決事項
Season間PvP・報酬数量・新規Cosmetic登録・連続在籍7日・旧POWER終了は承認済み。旧POWERはPreviewでCLOSED。詳細はformal_open_approved_decisions_20260914.md。売上KPI集計は公開後対応。

## 現在の制約と停止点
作業環境exec-server復旧。最新ed21545のcheckout・添付読取が可能。対象Vercel teamへの接続は403のため配信設定診断は不可。再認証依頼を繰り返さず、この制約を明示する。
公開準備完了とは判定しない。旧fixture成長型の無断継承や未確定KPI/Season規則の創作、Production公開、Season実リセット、運営告知配信は行わない。
