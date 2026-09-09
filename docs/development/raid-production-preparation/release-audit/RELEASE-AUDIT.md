# 配信・Edge・既存受入の独立監査

監査日時: 2026-09-09 23:30–23:40 JST。今回の操作はVercel GET、Supabase Edge list/get、ローカル資料読取のみ。外部書込み・Deploy・QA操作なし。統合候補完全SHAは親の最終manifestを正とする。

## 実Production

- URL: https://www.tribe-neon.com
- alias GET /v4/aliases/www.tribe-neon.com → dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx。
- deployment GET /v13/deployments/dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx → READY / production。
- SHA: 550c02225cbecb6ba6f174ee3fb952bcaae2f6dd。
- branch: codex/production-base-battle-top-20260909。
- project: prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb。
- 作成: 2026-09-09 08:58:44.490 JST。READY 08:59:16.088 JST。
- alias updatedAt: 2026-09-09 09:00:17.902 JST。alias APIの更新値であり、これだけで全traffic切替完了時刻を保証しない。

## 配信設定

Vercel project env一覧と非秘密設定の個別GETを照合。秘密値は記録しない。project envは次回buildの入力候補であり、既配信artifactの値を保証しない。

| key | 現production設定 | 今回の公開build要件 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://api.tribe-neon.com | 保持。Production ktpolnkyyfkowxdmijwwへの対応を再照合 |
| SITE_ORIGIN | https://www.tribe-neon.com | 保持 |
| NEXT_PUBLIC_USE_MOCK_DB | false | false必須 |
| NEXT_PUBLIC_ENABLE_QA_TOOLS | false | false必須 |
| RELEASE_INDEXING_ENABLED | false | 保持、公開検索の別判断を混在させない |
| NEXT_PUBLIC_APP_ENV | production targetにsensitive登録あり、値非取得 | productionをbuild入力で明示・確認 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | production targetにsensitive登録あり | 対象Production対応を秘密値を出さず検査 |
| NEXT_PUBLIC_RAID_ROOM_UI_ENABLED | production target登録なし | trueをbuild入力に明示 |

NEXT_PUBLIC_RAID_ROOM_UI_ENABLEDはRaidTab/GameContext/useBattle/救援リンクの分岐に使用される。設定を入れずに配信すると旧UIのままとなる。公開時は固定SHAの新しい作業ディレクトリからlockfileどおり依存を解決し、production用buildを新規生成する。既存Mock .next/.vercel/outputを再利用しない。配信前にartifactがMock false、QA false、Room true、Production APIを含み、Preview refを含まないことを検査する。今回のローカル検証buildを公開artifactとして再使用しない。

## Edge固定と組合せ

Productionにはresolve-battleのみ存在。ACTIVE、version 1、verify_jwt=true。取得bundle SHA-256は360175d0269a7f7307827fd0a71cd481d90870e28e0e8c24157e3e6fe6540dd3。取得原本はproduction-edge-source.json、個別比較はedge-source-hashes.json。sourceは4ファイル、資格情報なし。

現EdgeはRAID_SERVERをfinalize_raid_battleへ固定送信する。候補はget_raid_battle_route_v1を照合してROOMならfinalize_raid_room_battle_v1、LEGACYならfinalize_raid_battle。失敗/不明routeは409で停止し、legacyへ推測fallbackしない。index.ts変更とraid-room-route.ts新規が必要。他3ファイルengine.ts/canonical_runtime.ts/canonical_effects.tsは取得原本とbyte一致。したがって「フロントだけ先行」「新Room開始後に旧Edgeへ単独復旧」は不適合。

必須順序: DB依存を適用しACL/routeを確認 → 新旧両routeを扱う固定Edgeをverify_jwt=trueで適用・source readback → 同固定候補のfresh production frontend build → 親の一回の配信/切替 → 実接続smoke。公開中の旧戦闘はLEGACY経路と既存finalizerを保持する。旧フロントへ緊急復帰しても、新Room Replayが残る間は新互換Edgeと台帳を保持する。Edge原本への復旧は新Room停止と未確定Room Replayゼロ確認を満たす場合だけ検討し、付与済み台帳/装備/報酬を削除しない。

## 初期装備の有効な既存証跡

古いraid_step6_supplement_reportの403は後続修正前であり、現候補の失敗結果へ転記しない。最新実接続証跡はraid_fixes_preview_execution.mdとevidence/raid-fixes-live/、source b7e523b7c4651a8682f5e182733604e5e463316d、Preview dpl_9zVwKca7ctj9Bm7rXdC7gir3VGiR。

| 項目 | 有効な結果 | 制限 |
|---|---|---|
| 新規正規Setup→無料10連→初期装備付与 | 実HTTP200、DB5件、GRANTED | Preview上、Productionではない |
| DB/装備UI/総合力 | 5/7枠、UI/API 87,341一致 | 該当QA・時点の結果 |
| 本人RPC再試行 | 同5 UUID、追加付与なし | 実HTTP |
| 匿名再読込 | 同UID/同5 UUID/87,341 | password再ログインではない |
| Fresh導線 | 育成→編成→Quest→戦闘→案内→Home到達 | メール確認・通常再ログイン未確認 |
| 既存403ユーザー | 非付与・receiptなし保持 | 自動救済/backfill対象外 |

参照raw: fresh-equipment-first.json、b-retry-power.json、b-reload.json、b-equipment-power-after-tutorial.json。再試行直後の未編成power=0と、編成後87,341を別時点として扱う。raid_approved_top_preview_report.mdも後続の通常再ログイン証跡なしと明記。Mockのlogout/relogin投影試験PASSは実認証成功の代用にしない。

統合受入へ追加する未確認分:
1. メール確認を完了した同じFresh identityで通常signInWithPassword、同5 UUID/receipt/総合力、追加grantなし。
2. 固定統合候補で実チュートリアル通常攻撃/スキル命中画像、HP減少とdamage数値同期、命中時cut-in解除、SKIP非表示、Result→継続。
3. 実端末Human Acceptanceはユーザー受入結果として別記録。自動操作・エージェント目視と混同しない。

## KPI並行変更

read_threadで「流入経路」(01a08501-e438-7451-bd78-6eea6ae68927)最新3 turnはitems空のため、その内容を推測せずローカル最新資料を照合した。「Add Daily/Monthly KPI Toggle」(01a07f0f-3729-7db0-9851-642099bc7264)は従前作業終了、毎時07分・37分の集計Cron維持という過去記録。現在の排他ロック取得の証明にはしない。

最新資料: ../game03-tribe-neon-kpi-first-touch/PRODUCTION_RELEASE_RESUMED_STATUS.md、2026-09-09 23:33:40 JST。
- Production migration 20260909140811 acquisition_subject_first_touch_phase1、20260909140820 acquisition_source_saved_results_phase1、20260909140828 acquisition_guild_cohort_denominator。
- First Touch129確定、saved results356行、QA恒久分類/除外維持。
- KPI専用branch codex/kpi-dashboard-production-20260904、SHA cf830b0d4c4cfcd7cf21be2273cc292148771273、deployment dpl_BYmmDVqp8toX4DX25X73LQC9VWy9。
- ゲームProductionへ配信なし。KPI dashboard認証後Acceptanceは未完了。ゲームclient Phase1はそのAdmin UI配信に含まれない。
- Raid 50%消化UUは未計測表示。新Raid公開によって計測済みへ勝手に変更しない。

これらは既適用KPI状態としてAのsnapshot/復旧保護対象へ渡した。旧KPI集計関数で上書きせず、KPI専用aliasをゲーム配信に割り当てない。最新KPI報告を根拠に新たなゲームclient変更をこのタスクへ無条件追加しない。

## 実行直前再照合と中止条件

親taskを唯一の実行担当とし、Character/Raid/Card側から追加Deployを発生させない。今回は他taskへ変更指示の送信なし。

実行直前は以下を新しい時刻付きで確認する:
- www alias/deployment/SHA、KPI専用alias/deployment、共有alias全一覧。
- Production DB実定義hashと必要migration集合、KPI3 migration実定義/ACL、除外分類、Quest CASH修正、PvP bigint修正の保持。
- cron.jobとcron.job_run_details/pg_stat_activity: 既存KPI 07/37集計や長時間transactionとの競合、旧Raid生成/ranking停止対象、新Raid期限処理の実定義。
- Edge version/hash/verify_jwtと必要secret名の存在（値は非出力）、frontend build入力とartifact接続先。
- 他taskの最新状態・本番変更予定、承認後に増えた差分。idleや過去返信を実行枠の予約とみなさない。
- 通常HP/閾値/報酬、QA短縮HP・テスト報酬なし、QA除外維持。
- 旧開始済み戦闘/新Room未確定Replay数、報酬台帳と受取済み状態。

hash/対象環境/組合せの不一致、予期しないDB drift、二重配信競合、必須実接続失敗、適用Bundleリハーサル未PASSは切替中止。データを巻き戻して帳尻を合わせず、保持した互換DB/Edgeで受付停止または直前配信へ復帰する具体手順は親runbookを正とする。

## 最終alias監査・切替対象の限定

2026-09-09 23:45–23:48 JSTにVercel GET /v9/projects/prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb/domains と /v4/aliases?projectId=prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb&limit=100 をread-only照合。alias75件、pagination.next=null。追記時刻23:49 JST。Production/alias変更なし。

| domain | gitBranch | 現deployment |
|---|---|---|
| www.tribe-neon.com | null | dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx |
| tribe-neon.com | null | dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx |
| kpi.tribe-neon.com | codex/kpi-dashboard-production-20260904 | dpl_BYmmDVqp8toX4DX25X73LQC9VWy9 |
| kpi-preview.tribe-neon.com | codex/kpi-dashboard-preview-20260904 | dpl_DFmBYsAi4xbV4KFkghwtXJMRkKC6 |

apex tribe-neon.comはwww.tribe-neon.comへの308 redirect設定、全4 domain verified=true。加えてtirbe-neon.vercel.appがgitBranch=nullで同projectへ登録されている。KPI2本にはそれぞれ同deploymentを指すGit branch aliasも存在する。

ゲームとKPIが同projectにあるため、汎用promote/rollbackでproject全体のdomainを再割当てする操作は今回の手順に採用しない。gitBranch付きdomainを必ず保護するという未検証の挙動に依存せず、固定Production buildの検証済みDeployment IDにゲーム2 domainだけをalias setする。CLI59.14.0のalias set --helpで構文確認済み:

```text
npx vercel alias set <検証済みDeployment ID> www.tribe-neon.com --scope kiyoshi-kitamura
npx vercel alias set <同じDeployment ID> tribe-neon.com --scope kiyoshi-kitamura
```

これは将来の切替手順例であり今回未実行。切替直前と直後に全aliasを比較し、変更allowlistをwww/apexだけとする。KPI本番・Preview・Git branch alias・その他73 aliasは不変、apexの308 redirectも保持を確認する。片方だけ成功した場合は新規受付を停止したまま状態を照合し、同じ2 domainに限って既知正常な互換配信へ復旧する。新Room開始後に非対応旧Edgeを戻すことは認めない。project全体の汎用promote/rollbackで部分失敗を修復しない。

## 最終SQL検証証跡レビュー

23:49 JST、CのREPORT.mdとproduction-bundle-result.json更新をread-onlyレビュー。Native PostgreSQL17で実7view・owner/ACL・table RLS/ACL・107policy・Cron metadata6件・migration履歴17件を再構成後、固定00/01/02/04を実psql wrapperでROLLBACK/COMMITともPASS。固定05のCOMMIT、4設定false永続化、空ユーザーDBでのRoom/Replay/Present件数とCron metadata保持もPASS。05は設定4 singletonの存在とfalseをassertする修正を含む。

以前の「00/04未実行」「05未実行」というレビュー指摘はこの最終結果で解消。既存RLS/ACL/policy・関数owner/ACLの04保護も追加済み。残るC総合判定PARTIAL_PASSは妥当で、同じProduction再構成DB上の全業務ライフサイクルとSupabase Auth/Edge/UI/Cron daemonの実接続は未完了。別schemaの17件fixtureをそれらの代用にしない。最終hashはCのREPORTとbundle/SHA256SUMSを参照する。

親最終追記: Cの追加検証で同一Production再構成＋Bundle DBの13群業務フローもPASS_SQL_SYNTHETIC_RESULTとなった（rehearsal/same-bundle-lifecycle.json）。先の同一DB未実施の指摘は解消。実Auth/Edge/Cron daemonの全体接続は引き続き未完了。
