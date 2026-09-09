# A 本番実定義・適用Bundle（本番未実行）
監査時刻: 2026-09-09 14:35–14:40 UTC。対象 Production `ktpolnkyyfkowxdmijww`。全アクセスは catalog / SELECT、変更なし。

## 実定義での必要性
catalog.json は202 public relation、405 functionの本文・signature・owner・ACL、列/制約/索引/trigger/RLS/policy、履歴、6 Cronを保存。9分類hashを本番READ ONLY再取得し全一致。private schemaは存在しない。raid_rooms・初期装備receipt/RPCも不存在。履歴だけを根拠に未適用とはしていない。

02は受入済み `3ec04503024211e720489a56f9bfa6ae7cb5c66f` の19ソース: Raid 00250–00263 (14)、daily authority 20260908175140、aggregate 175143、display 181251、remaining pages 20260909023226、initial equipment 20260909075933。原本SHA256は plan-manifest.json。transaction/notifyの統合とCron登録分離だけを加工。01は実Production snapshot本文からmetadata4項目を追加し、SPD/LUK補正を保持。旧未登録tutorial/PvP等のmigration一括再適用なし。

置換対象23関数名（25 signature）は既存step2で検討済みPreview本文hashと全一致。initialize_current_playerは新規user作成transactionへのreceipt INSERTだけが意図差。新規初期装備はtutorial gacha完了後5固定品目、一回台帳、既存inventoryならSKIPPED、既存userはnot_eligible。QA user INSERT・短縮HP・テスト報酬はBundleにない。

## 保持
対象外関数本文は04 postflightで保護。Acquisition remote-only履歴 20260909140811 / 20260909140820 / 20260909140828 を観測。quest cash hotfix 20260908162650、PvP bigint 20260909003245、KPI保存 20260908042558も維持。業務ユーザー・資産・Present・既存Replayをコピー/変更/削除していない。

既存Cron6件は全件維持:
- anonymous-onboarding-cleanup-daily: 0 18 * * *
- daily-ranking-reward-finalize-jst-midnight: 0 15 * * *
- preopen-guild-power-finalize-20260909-jst: * 15 8 9 *
- ranking-pvp-monthly-jst: 0 15 * * *
- ranking-raid-weekly-jst: 0 15 * * 0（job保持、RAID呼出しはno-opへ）
- kpi-overview-saved-results-half-hourly: 7,37 * * * *（120秒timeout含むcommand保持）

## 切替契約と二重発行防止
DB適用時点でRaid順位新規発行は停止する。PVP/POWER/GUILD_POWER維持、旧台帳/通知/Presentは削除しない。旧生成/開始はraid_legacy_settings.enabled=trueとしてstageされ、公開切替時にfalse。旧開始済みReplayは旧finalize/保存済み結果再取得を維持し、Roomへbackfillしない。観測時の旧PENDING RAIDは0、実行直前に再確認が必要。

Room判別はraid_rooms.raid_boss_instance_id。旧報酬入口はRoomを除外。新確定はReplay/Room/bossロック、再送時保存済み結果、damage log一意性。救援/討伐は各 Room×user receipt と Room×user×item grant に分離し、既存Present受取へ接続。再送で二重発行しない。救援と討伐両資格は別報酬であり重複障害と混同しない。期限24時間、全体/Guild救援投稿は各3回、毎分100件期限finalize。

## 公開値
settings-observation.json は実Productionマスター、QA版ではない。HPは現行値を保持:
SHINJUKU 32,000,000 / SHIBUYA 28,000,000 / IKEBUKURO 36,000,000 / ROPPONGI 34,000,000 / AKIHABARA 30,000,000 / KAWASAKI 38,000,000 / YOKOHAMA 35,000,000。全7種production_enabled=true、各5体。新Roomでもvariant.max_hpを使い難度HP倍率を勝手に足さない。

確定済み参加戦力下限: beginnerなし、intermediate160,000、advanced200,000、expert240,000。
未確定: 4難度の救援minimum battles/contribution damage、討伐minimum contribution damage、救援/討伐item_id/quantity。初期SQLはNULL・報酬falseを保持する。smoke-settings.proposed.json のCHAR_EXP_S/EQUIP_EXP_S各1、QA短縮HPは本番値として採用しない。公開HPの別調整要望がなければ現Productionを保持する計画。新規作成/戦闘/救援flagはstage後false。公開前の確定設定とenable transactionは残判断であり、未確定値を埋めて公開しない。

## 実行順（今回実行禁止）
配信は親の単一統合担当。実行者は開始直前に担当名・時刻・Deployment ID・統合完全SHAを適用台帳へ記録する。キャラ側の別Deployは禁止。
1. 他担当のKPI/Acquisition/運用変更と変更窓を合わせ、Production配信SHA・環境ref/host、Edge hash/version、DB catalog9分類とprivate不存在、Cron、HP/報酬master、旧PENDING、旗/公開設定を再取得。差異は再監査する。hash期待値の機械更新で通さない。
2. 本番相当リハーサルと設定判断が完了した後、固定manifest全hashを検証。接続先を管理API/接続hostで照合。db push、history repair、一括migration replayを使わない。
3. `psql -X -v ON_ERROR_STOP=1 -v raid_commit=true -f docs/development/raid-production-preparation/bundle/review-apply.psql`。単一transaction: 00 guard→01 snapshot→02 delta→04保護検査→schema reload→commit。変数省略はROLLBACK。SQL本文をCOMMITへ編集せずhashを維持。60秒statement/2秒lock timeout。DB stageだけでもRaidランキング停止のため公開窓内で実行。
4. DB後、統合SHAのRoom対応 resolve-battle Edgeを適用（verify_jwt=true）。既存engine/runtime/effects保持、indexのRoom routingと新raid-room-routeを含める。Edgeの実読戻しhashを確認。
5. `03-expiry-cron.sql` を同じpsqlオプションで実行。新job raid-room-expiry-minute、* * * * *、finalize_expired_raid_rooms_v1(100)。同名jobがあれば中止して定義照合。既存6jobをunscheduleしない。実daemonの実行成功を確認。
6. 確定済み設定を反映し検査。NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=trueをProduction用ビルドで固定し、同一統合SHAを一度だけDeploy。DB/Edge互換検査後、旧enabled=falseと新creation/battle/rescue enabled=trueを変更窓内の運用transactionで切替。確定報酬設定以外は有効にしない。設定SQLは未確定判断が解消した後に別hash固定・リハーサルが必要。
7. 新規挑戦/参加/救援/自然終了/期限/再送/Present受取、旧開始済み経路、Character/枠/チュートリアル命中/HP数値同期/カットイン解除/Result継続を実接続検査。人の受入とは別記録。

## 中止・復旧
- hash/実定義/配信SHA drift、private新設、同名Cron、権限不一致、依存master欠落、未確定報酬、リハーサル不合格、型/build不合格で公開中止。
- commit前はON_ERROR_STOPで停止してROLLBACK、timeoutもtransaction丸ごと復旧。中間writerを公開しない。
- commit後は前進復旧。05-stop-new-operations.sqlを`-v raid_commit=true`で実行し新creation/battle/rescueと旧start/generationを止める。通常参加登録を含む全書込停止ではない。Cron・既存receipt・復帰・finalize・本人Present受取を維持。
- Room開始後はRoom非対応旧Edge/UIへ戻さない。Room対応の既知正常組合せまたは前進修正。報酬異常のみ該当難度報酬enabled=false、未発行対象を記録。台帳DELETE、資産/RP返却、過去報酬再計算、旧Raidランキング復活を復旧策にしない。
- 取得前定義はcatalog.jsonにあるが自動downではない。基盤破損は別環境バックアップ復元の検証後に切替計画を立て、共有Productionを無計画に巻き戻さない。


## 正本資料の探索
指定Project sourcesディレクトリは存在するがファイル0件（隠し項目含む）。追加の確定値を取得できなかった。既存 raid_room_preview_acceptance_report_20260908.md:110 は『今回の調整は正式バランスの確定ではない』、raid_room_preview_cutover.md:26 は未承認候補を確定投入しないと明記。従って実機QA報酬を本番設定に昇格しない。public-settings.jsonに確定／観測／未確定を機械可読で記録。

生成法: scripts/raid-room/build-step2-plan.mjs の既存ロジックを本番catalogと受入3ecの19ファイルへ適用し、最終reviewでprivate不存在guard・明示commit変数を追加した。固定成果はBundleとSHA256SUMSであり、旧Preview生成スクリプトを再実行して上書きしない。

Supabase公式changelog（https://supabase.com/changelog.md）とRLS/Cron docs（https://supabase.com/docs/guides/database/postgres/row-level-security 、https://supabase.com/docs/guides/cron）を確認。RLSとGRANTを別々に検査し、Cron登録とdaemon実行証跡を区別する。

04 postflightは既存public tableのRLS/ACL・全既存policy・全既存function owner/ACLも保持検査する。05は4 singleton存在・falseをassertし、欠落時は中断する。

依存マスター再確認:7 variantすべてboss_master FK対象あり・HP正・5メンバー、初期装備固定5品目あり（master-dependency-check.json）。read-only探索中の誤列名idとcardinality(jsonb)は失敗後にcatalogに合わせraid_variant_id/jsonb_array_lengthへ修正した。失敗queryにも書込なし。
