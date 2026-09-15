# GAME03 / TRIBE NEON 本流引継ぎ — Quest / Raid攻略性改修

STATUS: 作業途中の保存。ユーザーが会話長制限により次スレッドへ移行。公開・受入完了ではない。

## 最初に読む情報
- Repository: kiyoshikitamura/tribe-neon
- ローカル再開branchは `codex/quest-raid-identity-20260914`、再開時commitは `b7a4dee`。旧記載のhandoff branchは実在確認なし。
- 作業基準・最後に配信成功確認済みの統合SHA: `51245a75509fa870f3942b3f27f5d58676cea3b7`
- 統合Preview branch: `codex/formal-open-integration-preview-20260914`。今回途中差分では更新していない。
- 最後の配信詳細: https://vercel.com/kiyoshi-kitamura/tribe-neon/23JQtBwzkVKSX2D6VbJfpsGMJZMQ
- Preview Supabase: `sufvuqdnqohpfzkwxohq`
- Production Supabase: `ktpolnkyyfkowxdmijww`。今回Contribution監査だけREAD ONLY、書込みなし。
- Production: NOT EXECUTED。公開許可なし。
- 注意: Preview DBは下記3Migrationを既に適用しており、最後の配信SHAより先行している。PreviewコードとDBが一致済みと扱わない。

## ユーザー方針
親エージェントで子エージェントを並行運用。議論は原則別スレッド。承認済み作業は進め、未決だけ具体的に依頼する。
覚醒/LB・おすすめスキル・素材など実機確認は残件とまとめる。今回のQuest/RaidもDB差だけで受入PASSにしない。
作業基準は歴史的に661dfd3＋確認済みProduction差分を継承。欠落Production SHAの祖先性を捏造しない。Activity/Banner等の受入差分を保持。

## 今回の確定仕様
### Quest
- 7地域のEnemy/Reward Identity: 新宿ATK/キャラ素材、渋谷SPD/スキル、池袋DEF・HP/装備、六本木Skill・Balanced/指南書、秋葉原LUK・特殊/チケット、川崎高ATK/改造パーツ、横浜Balanced・耐久/キャラ装備バランス。
- 最優先UIは7地域選択カード。敵傾向と欲しい素材が詳細前に分かること。
- Area×Difficulty Drop Authority。確率具体値はMaster作成・総期待価値監査後FIX。既存Item IDだけを使う。
- 既存Area×Difficulty Random Enemy Poolを活用。地域Growth型の重み調整。
- 正式OPEN CASH: EASY300 / NORMAL600 / HARD1000。Energy・時間・Sink不変。
- 地元一致: 基礎CASH+10%、Drop+200bp。LUK非連動。既存hometown Snapshotを一括更新しない。
### Raid
- 7地域: 新宿高火力/DEF・軽減、渋谷高速/耐久・SPD、池袋鉄壁/DEF Down・火力、六本木Skill/妨害、秋葉原状態異常/耐性・解除、川崎超火力低耐久/SPD短期、横浜持久回復/継続火力・回復対策。
- 初→中→上→超でCounter要求を強める。超級推奨総合力260000。既存Skill/effectを使い、新効果を創作しない。
- 撃破ごと: 初級SKILL_MANUAL1、中級SKILL_MANUAL1+EQUIP_LB_PART1、上級各2、超級各3。
- 難度別1日1回: 初級Normal RANDOM30%、中級50%、上級Special RANDOM1確定、超級Special Character/Skill/Equipment各1確定。
- InstanceとDailyは別ledger。Daily抽選外れも記録して再抽選不可。直接Bag。覚醒の書なし。
- 初中級: CLEARED前の正式finalized Battle1回以上。上超級Contribution閾値は未FIX、本番実測後判断。
- Raid Point、5分Respawn、4難度、Gacha確率、Season報酬、Guild経済不変。
### Quest発見Raid追記（旧2倍を廃止）
- Item Dropを増やさず、元Quest基礎CASHと同額の追加CASH＋User EXP50%を撃破時に付与。
- 地元一致は基礎Quest報酬だけ。Encounter追加額へ乗算しない。

## 実装・適用状況
| 項目 | 現在 |
|---|---|
| Quest21地域×難度Pool | 独立Poolに接続済み。確率は旧基準を複製した段階で、地域Drop差別化は未完了 |
| Quest CASH | Preview DB300/600/1000。ローカルcanonical JSON更新済み |
| Quest Enemy Weight | 主Growth型の既存重み3倍をPreview適用。候補/レアリティ/個体Statを保持。体感の実戦受入未完 |
| Quest7地域UI | 敵傾向と実際の所持Reward概要を実装。未成立のUP訴求なし。未配信 |
| Raid Instance/Daily | Preview DB適用・rollback試験PASS |
| 上級/超級新報酬 | enabled=false / minimum_contribution_damage=NULLで保留。Previewでは現行高難度報酬もunconfiguredとなる。新規高報酬が有効と案内しない |
| Raid UI | 7地域ヒント・4難度の報酬比較・日次実receipt表示を実装。server policy取得、上超級pending表示。未配信 |
| Raid Stats/Skill | 28profileの具体候補SQL/JSON作成済み、DB未適用・検証未完。詳細下記 |
| Quest発見Raid | Preview DBでItem2倍廃止、CASH/EXPへ変更。対象UI修正済み未配信 |
| Contribution | 本番READ ONLY監査完了、判断待ち |

## 適用済みMigration — 再適用禁止
| Repositoryファイル | 実Preview version |
|---|---|
| 20260914173738_raid_instance_daily_rewards_v2.sql | 20260914174142 |
| 20260914173853_quest_raid_cash_xp_bonus.sql | 20260914174158 |
| 20260914174319_quest_area_identity_formal_open.sql | 20260914174340 |

新テーブル: raid_daily_clear_bonus_rules / raid_daily_clear_bonus_ledger。RLS、公開権限を制限。get_raid_reward_policy_v2はauthenticated読取。
既存Room↔Instanceは一意。Daily日はboss.cleared_at/outcome_finalized_atのJST日で受取・retry日ではない。
既存受給ledgerは保持し遡及Daily付与なし。既存未受給Instanceは今後finalize呼出時に新ルールで評価される可能性がある。

## Quest発見Raidの実装詳細
- quest_raid_encountersにbonus_cash / bonus_user_xp、bonus_grantsにcash / user_xpを追加。
- _quest_raid_cash_xp_v2は完成済みQuestのrewards_accrued.base_cash / xpを優先、欠落時canonical Masterへfallback。
- resolveの新規DRAWNで計算済み額を保存。旧行を一括更新しない。
- issue_quest_raid_encounter_bonus_v1はclear受給ledger INSERTだけ付与。rescue側triggerは呼ばれてもreturnし追加付与なし。
- 対象は従来の適格Clear受給User。発見者限定の新条件は追加していない。
- ボーナスは既存room/user ledgerで1回。CASHはserver加算、EXPはapply_user_xp。
- 旧issued rowは再付与せずUIで以前の条件受取済み。旧reward_multiplier=2の保存値も現runtime/UIでは1として扱う。

## 実行済み検証
- tests/db/raid_instance_daily_rewards_v2_preview_rollback.sql PASS: 4難度quantity、同Instance再送/別Instance、Daily当落固定、Random具体ID、JST翌日、上超級gate、付与失敗rollback、内部RPC権限。上超級は試験transaction内のみ仮解除し全ROLLBACK。
- tests/db/quest_raid_cash_xp_bonus_preview_rollback.sql PASS: 地元込みcash9999をfixtureにしてもbase300のみ、EXP50%receipt、Item変化なし、再送一回、hometown snapshot不変、projection倍率1。実戦E2Eではなくclear ledger入口のfixture試験。
- tests/db/quest-hometown-fixed-bonus.sql PASS: CASH半減後21course、一致/不一致・LUK非依存・旧Snapshot/新規start/claim・再送。
- scripts/verify_quest_area_identity.mjs PASS。
- scripts/verify_raid_strategy_reward_display.mjs PASS。
- Typecheckはnullableエラー修正後PASS（Profile/UI最終編集後は再実行が必要）。今回全変更の最終buildと配信は未完。
- 検証用データ変更はすべてROLLBACK。恒久変更は上記3Migrationのみ。

## Raid Profile 作業途中
- supabase/operations/raid_strategy_profiles_20260914.sql: 約121KB、28profileの旧完全JSON一致guard付きDML。DB未適用。
- src/domain/gameplay/canonical/data/raid_strategy_profiles_20260914.json: 旧baseline＋新profile。
- 現役raid_room_combat_profilesを更新し、新規Room生成に使う。既存raid_room_combat_snapshots / Replayを更新しない計画。
- 既存 _raid_room_launch_enemy_snapshot_v1 で全140memberを検査する処理を候補SQLに含むが、実DB実行未完。
- docs/development/raid_strategy_identity_candidate_20260914.md を読み、実装候補と古い「未実装」説明の矛盾が残っていないか整理する。
- Profile.minimumPowerに既存240000を保持しているものあり。推奨260000と参加条件を混同して勝手に変えない。UIは260000を保持。
- Skill AP、回復/妨害が実Battleで成立するか、難度別Counter効果を確認してから正規Identity表示へ切替。現在src/domain/raidStrategy.tsは既存Statsで支持される説明を優先した途中状態。

## 未決・未完
1. Quest Area×Difficulty確率: docs/development/quest_area_identity_economy_candidate_20260914.mdに21行候補。素材間共通価値換算なし。確率合計一致を価値一致と偽らない。現Poolは別名だが確率同じで、核心のReward差別化は未完。ここを完成させる必要がある。
2. 上級/超級Contribution: docs/development/raid_contribution_measurement_20260914.md。本番正式193戦。上級63戦7UU、超級43戦6UU。1戦raw/HP中央値7.97%/4.03%。上級累積applied3%→24/25組、5%→23/25、10%→19/25通過。超級撃破1Instanceのみで根拠不足。raw/applied・比較境界・新Stats後再測定を含めユーザーへ依頼。
3. 旧Quest基礎CASHの切替: claimは現在のQuest Masterを読むため、開始済みも新基礎CASH＋旧保存地元加算となる。hometown Snapshot自体は保持したが、基礎CASHまで開始時固定ではない。正式OPEN時の適用境界を明確にして受入する。
4. Raid Profile候補適用・機能/実戦検証、7地域正規ヒントの完成。
5. 全変更最終型/build、専用Preview配信、実機確認。DBとUIが一致してから依頼する。

## 再開順
1. このhandoff branchの最新SHAをcheckout、git status/差分を確認。
2. Preview適用済み3Migrationの実versionをREAD ONLY照合。再適用しない。
3. Raid Profile候補とQuest Drop候補を確認し、進められる作業を完了。未決は具体候補で依頼。
4. Quest/Raid/地元/再送・日付境界の必要な回帰、typecheck/build。
5. 統合Previewへコード反映、固定URL/配信SHA/PreviewDB接続を記録。Productionは未実行で停止。
6. 元のformal_open_remaining_after_device_20260914.mdも引き続き管理。課金Sandbox/available:false、Season運営接続、素材・その他不具合受入を消さない。

## 環境・保存メモ
ローカル /workspace/scratch/f4254bc8e7a6/integration は一時領域。消えてもGitHub保存を正本に再取得する。
git READ clone/fetch可。git pushの資格情報は無いのでGitHub create_tree/create_commit/update_refを使用。base treeへ変更ファイルだけ追加しlocal treeとの一致確認。
Vercel team接続403が以前発生。GitHub commit statusで tribe-neon配信成功確認可能。別project chat-fix-previewのfailureと混同しない。
本番設定・秘密値を表示しない。ローカルbuildはNEXT_PUBLIC_USE_MOCK_DB=true next build --webpackを使用していたが実接続E2Eの代用にしない。

## 2026-09-14 再開後追記

- Preview適用済み3versionを実履歴で照合。再適用なし。Production接続・変更なし。
- 空だった `20260914174319_quest_area_identity_formal_open.sql` をPreview履歴20260914174340のstatementsから復元（ファイルのみ）。
- Raid28profile baseline一致。候補SQLで全140member生成PASS後ROLLBACK。数値候補は恒久未適用。
- 1,680戦のローカル比較を追加。秋葉原の対策効果を確認、横浜の最大HP比例回復と他地域の対策有効性が課題。詳細はraid_strategy_identity_candidate_20260914.md追記。
- Quest21行候補の素材別供給量・地元一致・最大集中ケースをquest_area_identity_supply_audit_20260914.mdへ記録。確率は未変更。
- 3DB回帰（Raid Instance/Daily、Quest発見Raid CASH/EXP、地元固定）再実行PASS・全ROLLBACK。typecheck、Quest/Raid表示テスト、webpack build PASS（mock buildで実接続代替ではない）。
- 上級／超級Contribution、Quest確率、進行中QuestのCASH適用境界、Raid数値調整・実機受入は未決／未完を維持。

## 追加FIX: PvP → Raid 報酬接続

仕様正本: specs/pvp_battle_raid_ticket_reward_20260914.md。
WIN=200 CASH＋RAID_POINT_TICKET1、LOSE=50 CASH。3勝は各勝利合計3枚、追加Bonusなし。
既存毎戦EXPと3戦指南書/CASHを置換。RATE/Ranking/Point/Fight Ticket/Quest/Raidの仕様は維持。
実装記録: docs/development/pvp_battle_reward_implementation_20260914.md。
Preview追加適用済み: Repository 20260914223252_pvp_battle_raid_ticket_rewards.sql → 実version20260914223627。再適用禁止。
サーバー実receipt・Exactly-once・TOP表示・Resultチケット強調・任意Raid CTAを実装。DB rollback/SSR検証PASS。実機は残件。
Questの確率、高難度Contribution、CASH切替境界、Raid数値調整の未完了はこの追加で解消していない。

## 最新状態：残件対応の追記（以前の未適用記載より優先）

- 基準remote 2c9602efa0934b13a8d80974dc4375dffd5ecb26。
- Raid28profileをPreviewへ適用済み。Repository `20260914231128_raid_strategy_profiles_activation.sql` → 実version **20260914231249**。これで本件適用済みは計5件。すべて再適用禁止。Production接続・反映なし。
- 全140memberの生成検査を通過。既存14 combat snapshotは適用前後同一hash。旧operations SQLも再実行しない。
- 新規Raid選択の7地域ヒントを実装。policyのstrategyVersionが全4難度2026-09-14の場合だけ有効化。高難度報酬は引き続き保留。
- 共有HPの減少はraw damageから計算し、ローカル敵HP純減ではない。横浜の回復量だけを理由とした保留判断を訂正。1枠の通常Skill変更・独立評価seedで全28条件の平均改善を確認。実戦受入とは区別。
- Quest21Poolの確定用候補・素材別供給比較を quest_identity_review_candidate_20260914.md/.json に作成。未承認・DB未適用。
- 仕様確定3点を quest_raid_remaining_decisions_20260914.md に具体化。確率案／開始時CASH固定案／累積applied上級3%・超級5%以上案。採用決定は未取得、実装済みと扱わない。
- 最終typecheck・Raid表示・PvP/Raid/Ranking master・PvP実コンポーネントSSR・webpack build PASS。mock buildで実接続受入ではない。
- Raid Instance/Daily・Quest発見Raid CASH/EXP・PvP報酬のDB回帰を再実行し全PASS・ROLLBACK。
- 初回PvP finalize2本の並列送信はDB時刻上で直列だった。同時競合検証は未完。専用QAデータは削除確認済み。
- 実機E2E、固定Preview URL/接続DB照合は未完。Vercel対象team参照403・ローカル認証なし。GitHub配信statusだけで実機確認済みとはしない。

## 最新：3案承認後の実装（以前の未決表記より優先）

- ユーザー「良いです」により、21Pool案・開始時CASH固定・上級3%／超級5%累積appliedをFIX。再承認不要。
- Repository `20260914234114_quest_raid_approved_reward_identity.sql` → Preview実version **20260914234801**。本件適用済みは計6件。既存5件は再適用していない。Production接続・変更なし。
- 21Pool抽選行を承認済み数値へ変更。canonical JSONとPreview DB完全一致をrollback試験で確認。既存Normal Skill Ticket使用、RANDOMは既存具体ID解決。
- 新規QuestはINSERT時にbase_cash_snapshotをServer保存。受取と発見Raid追加CASHがこれを使用。更新による上書きを拒否。開始後Master変更でも保持。
- 既存未受取13件は全件切替前開始のため600/1200/2000を固定。受取済み109件は変更なし。地元Snapshot全行保持。
- 適用前後：completedHash=123b759f942cc71bd2355e6365ccfdce、hometownHash=21f1aacac6dd35f65ff011279d327e39、raid enemy snapshotHash=dcdf8e924e2849bdc2d82e0c55af4a05で一致。
- 上級/超級のInstance/Daily報酬を有効化。同Instanceの正式・non-lateのapplied damageを累積。閾値ceil(保存max_hp×3%/5%)、比較>=。既存受給ledgerは保持し一括遡及配布なし。
- UI：高難度3%/5%条件、実閾値の「以上」、進行中Questの保存額＋地元加算による獲得予定CASHを接続。旧receiptの>比較表示を保持。
- 追加境界DB試験PASS：旧/新CASH、Master変更、Snapshot上書き拒否、再送、発見Raid基礎額、3%/5%未満・一致・端数切上げ、討伐戦の集計、late除外、Instance/Daily一回。試験は全ROLLBACK。
- 既存DB回帰PASS：地元21course、Raid Instance/Daily/JST、Quest発見Raid、PvP3勝1敗/Point/Ranking/Inventory/故障rollback。表示検証・typecheck・webpack build PASS。mock buildは実機代替ではない。
- 仕様判断3点は解消。残件は実機E2E、独立DBセッションの初回finalize同時競合、配信固定URL/接続DBの照合。Vercel参照403とローカル認証不足は継続。

## 2026-09-15 親エージェントでの並走対応

ユーザーが並走を明示承認。課金、Season、Preview受入、PvP競合の4担当で対応。成果・接続制約・最後のユーザー依頼は `parallel_preview_readiness_20260915.md` を正本とする。最新実機手順は `formal_open_preview_acceptance_20260915.md`。
課金診断APIのPreview限定追加、Season runner実DB rollback試験、独立DB競合用script、旧9/16開始文言の修正を統合。親側でPreview月次cronをinactive登録済み。実Season切替・報酬配布・Production反映なし。

追加適用済み: Repository20260915000741_monthly_power_rollover_definition.sql → Preview実version20260915000930。定義のみ、再適用禁止。旧月終了→次月2カテゴリ開始の実装・rollback試験完了。既存月次jobは新advance関数へ接続しinactive維持。実Season・Production変更なし。

## 最新運用方針：GitHub連携を主経路（2026-09-15ユーザー指示）

- 実装・Preview配信はGitHub→Vercelの既存Git連携を主経路とする。対象branchはcodex/formal-open-integration-preview-20260914。
- リモート保存後、対象CommitのVercel – tribe-neon statusを確認。別Project chat-fix-previewの結果と混同しない。
- Vercelプラグインは補助確認のみ。403解消は並行課題とし、実装・Preview配信を止めない。再接続を毎回の再開条件にしない。
- 固定URL・実配信DB・実機受入は独立の確認項目。Git連携成功だけでこれらをPASSにはしない。確認できない項目だけ残件へ記録し、進められる作業を継続する。
- Production反映は引き続き別承認。適用済みMigration再適用禁止・既存受入成果保持も継続。

## 2026-09-15 追加対応：Git連携経由の実配信確認

- GitHub check-runsのVercel Preview CommentsからブランチURLを取得： https://tribe-neon-git-codex-formal-open-integr-800ed5-kiyoshi-kitamura.vercel.app/
- 00:38 UTCのconfig GETでHTTP 200、配信SHA db20428a09c99a252ddc8060813fb88803951705、preview_database=trueを確認。GitHub tribe-neon statusもsuccess。ブランチURLは更新されるため、以降の実機受入は最新SHAを再照合する。
- 課金はENVIRONMENT_INVALID。sandbox_enabled / stripe_test_key_present / webhook_signing_secret_present / return_origin_valid がfalse。mode_sandbox / non_production_runtime / preview_database / service_role_present はtrue。キー未設定と形式不正の区別はこの診断だけではできない。
- 現時点でユーザーに必要な課金設定はPreview対象のBILLING_SANDBOX_ENABLED=true、STRIPE_SECRET_KEY（sk_test_）、STRIPE_WEBHOOK_SECRET（whsec_）、BILLING_RETURN_ORIGIN（利用するPreview origin）。秘密値はチャットへ貼らない。戻り先・Webhook登録URL・Auth許可URLはQAで使うoriginと整合させる。設定後はGit連携で新配信し再診断する。
- Cloud Browserで公開タイトル→TAP TO START→開始選択の遷移PASS。Home表示fixtureは読み込み後に描画、画像欠落0、desktop viewport 1363で横overflowなしを確認。HomeのBattleボタンはfixtureのno-opで、実データのD/E受入PASSにはしない。ブラウザ拡張由来のmetadataエラー1件はアプリ不具合と分類しない。
- 今回は公開PreviewでBrowser動作可能。以前のローカルERR_BLOCKED_BY_CLIENTを現在の公開Previewの阻害条件として扱わない。QAログイン・実戦・iPhone Safari・Stripe接続は引き続き未実施。
- バッグのBP/Raid Ticket使用成功後にbootstrap再読込が失敗すると誤って使用再試行を促す問題を修正。成功receiptを維持して再読込案内を表示し、別ユーザーへの遅延通知を抑止。両Ticket・刷新失敗・不正receipt・連打・ユーザー切替のhandler回帰PASS。既存Inventory projection検証もPASS。
- Preview診断へ検証済みVERCEL_URL由来のdeploymentUrlを追加。公開hostのみ返し、秘密値/任意URLは返さない。固定Deployment URLの取得をVercelプラグイン403に依存させない。Production応答の互換性を保持。
- DB変更・Migration再適用・Production反映なし。Vercel403再接続は実装/配信の前提条件から除外済み。

最新の依頼残件：上記4項目のPreview課金設定、QAログインと本人実機受入、技術競合試験用Preview PostgreSQL接続の安全な設定、正式OPEN/操作停止/Mission Claim起算日時。Production反映は別承認。

確認範囲：preview_database=trueは配信サーバーのDB URL設定一致を示す。今回は環境検証で停止しており、config経由のDB照会成功・ServiceRoleの有効性までは証明していない。バッグの修正もbootstrap内部で握りつぶされる取得失敗は検出範囲外。
