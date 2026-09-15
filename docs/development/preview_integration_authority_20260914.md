# GAME03 Preview統合候補 / 2026-09-14

## 固定基準

- User承認方式: `661dfd3 + 確認済みProduction差分`。
- BASE PREVIEW SHA: `661dfd3d4ed2de3ca0420185f18537be5e34baa9`。
- 照合対象Production: `dpl_6DFs3ee9hzRqQdC6D8nensQdNZ4y`。
- Production SHA（ユーザー提供）: `44e43ee43c358b3bbe0b5dce64e538453581ba36`。Git object未取得。祖先関係を満たすという旧方式の主張はしない。
- Preview DB: `sufvuqdnqohpfzkwxohq`。Production DB: `ktpolnkyyfkowxdmijww`（READ ONLY）。
- 第1統合SHA: `112a21377fc384f70d93230439eb64bc3b4d0767`。結果文言修正SHA: `ec6c7d2e0c2917b4923df3af85bf80fcd9325152`。実UI受入は未完了。後続の最終配信SHAは本流報告を参照する。
- PRODUCTION: NOT EXECUTED。

## 継承Authority

| 差分 | Authorityと照合 | 扱い |
|---|---|---|
| Activity基盤 | 受入済み`7d474ff`がbase ancestor。24時間、プロフィール、既存4種 | baseを保持 |
| Raid追加Banner | `2584995`がbase ancestor。実配信Home chunkでも`home_banner_master`追加・Raid遷移を確認 | baseを保持。重複取り込みなし |
| 永続SSR_CHARACTER Activity表示 | 過去会話検索で9/14 07:36:19Zユーザー「Production Hotfix受入（Activity / Banner）」の対象Deployment/SHA、永続SSR表示受入、Temporary/Preview-only除外を回収。全文末尾は未回収 | 表示対象のみ復旧。新規SSR Skill/Equipment表示は追加しない |

実配信照合元: `https://www.tribe-neon.com/_next/static/chunks/3q3_q-h3u_jj1.js?dpl=dpl_6DFs3ee9hzRqQdC6D8nensQdNZ4y`。

Activityの`get_recent_social_activity_feed`、生成関数`on_m9x_gacha_activity`とTriggerは両DBで一致確認。新規Activity migration不要。9/12 SSR非表示専用テストは後続の9/14受入と矛盾するため今回ゲートに使用しない。

## 未確認差分・同等性の限界

- 本番の全ソースとGit履歴は取得不能。配信chunk照合は全ソース差分の完全監査ではない。
- `SPECIAL_GACHA`導線は回収したHotfix受入の対象外。本番上では確認できても、未確認差分を勝手に統合しない。
- Banner表示はDBの画像URL、公開期間、RLS、Mission event、Feature Flag、画像decodeに依存。コード一致だけで表示同等としない。
- Edge Function、環境変数、全Feature Flagの同等性は未確認。Vercel環境変数への読取接続なし。
- 過去Banner受入のfixture検証を最新の実ユーザー回転・遷移・戻る操作の受入に代用しない。

## 実装・受入台帳

| 系統 | コード/DB状況 | 残る受入・阻害 |
|---|---|---|
| Skill | base UI整理済み。今回Mission名称を同一IDで正規化 | Preview適用済み。実画面受入待ち |
| Character/Equipment EXP | 素材個数によるLv加算の不具合あり | 正式必要EXPの承認版未回収。提案曲線を採用しない |
| Raid Mission | Preview適用済み・定義確認PASS | 適用後実1戦/再送/累積 |
| Guild tenure | 開始日時あり、投影未実装 | 加入日Day0/1 Authority未確定 |
| Quest難度/default | base修正済み | 全街/clear/locked/画面内選択維持 |
| Quest Party | base SQLがTutorial補正を失うため今回修正 | Main5名、PvP/Raid一致、Tutorial回帰 |
| Leader | base UI/RPC・Preview適用済み | 非先頭Favorite、編成外、reload |
| MyPage小Raid | base削除済み | 大導線/Banner/Activity維持 |
| Survey Present | baseでp_swr注入effect削除済み | 新規/既存/reload/Inbox/bootstrap、正規Present |
| Gameplay直接報酬 | SQL/UI実装済み・Preview DB適用済み | 旧Present・課金・補填維持、ledger/再送/即Bag |
| AP50 | Preview適用済み・定義確認PASS | 50超保持、自然回復、Fresh |
| 課金 | API available:false、原因未確定 | 配信環境、テスト決済、期限/KPI受入 |
| 売上KPI | refresh_kpi_revenueはPAYMENT OPEN時例外の旧stub | F10〜F13正式定義回収と接続 |
| ガチャPool | 回収済み正本との既存監査あり | 別スレッドの相違指摘原文未回収 |
| 目元10人/Emblem | 承認済みZIP所在あり、転送HTTP502 | bytes未取得、未接続。限定Emblem ownership含む |
| Season/準備Mission | 統合管理仕様あり | Close/snapshot/30日猶予/期限後非表示/新Season/限定付与 |
| 実機デザイン | 未実施 | fixture表示確認と本人実機受入は別 |

課金Pack/DIA、運営補填、既存未受取Presentの配送はGameplay直接付与化へ混ぜない。

## Preview適用・検証記録

2026-09-14 UTC。すべてPreview `sufvuqdnqohpfzkwxohq`のみ。MCPは実適用時刻で履歴versionを採番するため、ファイル名のversionだけを見て再適用しない。

| Repository migration version | Preview実履歴version | name |
|---|---|---|
| 20260914072512 | 20260914110821 | raid_room_mission_finalization_hooks |
| 20260914072613 | 20260914110825 | profile_leader_authority_v1 |
| 20260914074959 | 20260914110829 | formal_open_ap_max_50 |
| 20260914075032 | 20260914110835 | quest_main_formation_authority |
| 20260914110224 | 20260914110839 | skill_enhancement_mission_terminology |
| 20260914110219 | 20260914110949 | gameplay_direct_reward_delivery |

- Postflight: Raid finalize/clear Mission、Quest Main/Tutorial保持、Leader RPC、Skill trigger、AP初期値50、Quest/Room/Login直接配送、ledger RLS、helperのanon/authenticated呼出拒否を確認PASS。
- Typecheck PASS。Webpack Build PASS（development＋明示Mock設定、Vercel実設定Buildとは別）。
- PGlite: Raid finalize再送/資格/rollback、AP50/既存overflow保持、Profile Leader/編成独立、Quest実Tutorial wrapper、Gameplay直接配送/装備個体/旧Present/2倍/再送/atomic rollback PASS。
- 表示fixtureブラウザ確認: 旧Preview Home/Skill/Public Profile、実viewport1363×936・ゲーム枠430px。390px/本人実機未確認。Home fixtureのRPが `/5` となる不足を発見。実データの不具合と断定しない。
- 本人実機・実ログインの一気通貫受入は未完了。Preview受入完了と宣言しない。

## 残件の後続実装

- `ec6c7d2`: Quest結果、Quest戦闘結果、Raid戦績の旧Present配送案内を直接獲得に修正。Home fixtureのRP欠損を補完。
- 実機確認依頼先: https://tribe-neon-c81xlzaib-kiyoshi-kitamura.vercel.app / dpl_F1cZUy6JoV95Dq1nBhJuQx6gCq4y。Home/Quest/Skill/Leader/Quest報酬を依頼済み。ユーザー結果待ち。
- MissionPanelは端末時計の更新でSPECIALの受取期限を越えた行を非表示にする。通常Missionは保持。
- Preview適用: `20260914112059_formal_open_season_claim_contract.sql` → 実履歴 `20260914112919`。
- Postflight: event期限filter、終了後completion進捗停止、新規close/first-only RPC、anon/authenticatedの管理RPC拒否、既存イベント日時不変をPASS。
- 限定Emblem関数は限定ID必須、標準Emblemを拒否。既存no-arg finalizer/cronは変更しない。実際のSeason確定・配布・日時設定は未実行。
- PvP予約切替の後続migrationは未適用候補。インターバル中のPvP/Rate、POWER/GUILD_POWER新Seasonの残件を混同しない。
- Guild起算日・売上KPIの仕様回収/判断依頼は独立文書化。未承認の数値・起算日を採用しない。
