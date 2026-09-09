# 第6工程ローカル修正 C

基準648a513038284cfbcb65d3cf3a74ce02872cc9c4、branch codex/raid-step6-local-fixes-20260909。Character実worktreeは91f7a7d937fbbf427bfbaada0547f38c244e9a11、GameContext/migration未コミット差分なし。1a38636の仮所持排除は保持されるが、初期5件direct INSERTの403は未修正。重複したCharacter修正を取り込む必要はない。

原因はSQL121の意図したINSERT REVOKEとbootstrap direct INSERTの不一致。今回もテーブルINSERT権限を戻さず、新規初期化時にのみ作るprivate台帳を持つ本人へ、正規tutorialガチャ後、固定5種を一度だけ原子的付与する候補を使用する。既存空inventoryは初回とみなさない。売却/resetでは台帳を保持して再付与なし。アカウント全削除時だけCASCADE。既存403ユーザー遡及救済は範囲外。

前工程 scripts/raid-step6-supplement の候補と証跡は変更していない。共有GameContextは親専有。置換内容は初期read→空/キャラありなら本人RPC1回→保存済再read→UIとsyncUserPowerへ同equipsData、各await後認証guard。read失敗を0件とみなさず、RPC応答不明でも保存済readで照合、仮rowを作らない。

新 scripts/raid-step6-local-fixes/c-equipment-vertical.mjs は、PGlite0.5.8のmemoryDB実SQLと、実GameContextのequipmentブロックを直接抽出・TypeScript変換して接続する。正式source統合前の準備runだけ C_EQUIPMENT_PROPOSAL=true を明示して旧提案を使用した。デフォルトは実sourceに置換ブロックがなければFAILするため、提案PASSを本候補PASSに読み替えない。

準備run 8群PASS: 初回保存5件の同一UI/power投影、3回logout/reloginで追加0、commit応答紛失の再照合/次回追加0、INSERT途中失敗0件からretry5件、commit後read失敗から次loginで5件、logout中旧user投影0/本人再login5件、既存空inventory付与0、売却後bootstrap再付与0。eslint対象script0 errors/0 warnings。

SQL fixtureは既存候補schema/RPC、最新190 initializerへ新規users INSERT直後の台帳1行を加えたローカル定義である。実GoTrue/PostgRESTやGameProvider全体、実多接続競合ではない。外部DB/Preview/実Fresh操作なし。親source統合後の実source run結果は追記する。

## 実統合後の最終結果

親がGameContextへ置換を実適用し、CLI2.117 migration newで `supabase/migrations/20260909075933_initial_equipment_authority.sql` を生成した。親は現Previewのinitializer本文が最新190と一致することをread-onlyで確認。Cはその正式ローカルmigrationをmemoryDBへ適用し、実GameContextから抽出したブロックとの縦接続を再実行した。

- `C_EQUIPMENT_MIGRATION=supabase/migrations/20260909075933_initial_equipment_authority.sql node scripts/raid-step6-local-fixes/c-equipment-vertical.mjs`: 実source・実ローカルmigrationの9群PASS（8機能群＋catalog確認）。
- `node scripts/raid-step6-local-fixes/c-authority-test.mjs`: 正式ローカルmigrationで15群PASS。前工程テストの独立copyに実migrationを指定し、前工程の候補/証跡は変更していない。
- 両新規scriptのeslintは0 errors/0 warnings。

catalog検査ではpublic wrapper invoker/private authority definer、引数0、双方search_path空、authenticated実行可/anon実行不可、authenticatedは台帳INSERTと装備direct INSERT不可、private台帳RLS有効、FK CASCADEを確認。実advisorsサービスの実行ではなく、隔離DB内の属性/権限assertである。private definerが必要なのは固定内容をサーバーauthorityで付与するためで、権限error回避だけのdefiner化ではない。

初回保存/再試行/再ログインでは対象1人5件を保持し追加重複0。途中INSERT障害のrollback、DBcommit後通信結果不明、commit後SELECT失敗、logout時stale応答、既存0件user非eligible、売却/reset相当の装備削除後の再付与禁止も確認した。PGliteは単一接続のため8queueの再送を実多接続lock検証とは扱わない。実reset/discard全体のfixture、実GoTrue/PostgREST、実Fresh保存成功は未確認。既存403userに台帳を後付けする救済、付与内容/対象の拡張、外部適用は行っていない。

最終JSONはoutputs/raid-step6-local-fixes/c-equipment-vertical.json（projection=actual GameContext source/sqlSource=正式migration名）、c-authority-local.json。

Character再照合時刻: 2026-09-09T17:02:19+09:00。対象 ../codex-game03-tribe-neon-ux-party/tribe-neon-audit のHEADは91f7a7d937fbbf427bfbaada0547f38c244e9a11。git status --short 全体が空（tracked変更・未追跡ともなし）。加えてGameContext.tsx/supabase/migrations/src/domain/src/utils/src/libのdiff --statも空。従って照合時点の同treeに未commit initializer/equipment/helperを含む403対応差分はない。read-only照合だけで他treeへ書込・取込なし。

親の追加担当許可で既存 scripts/verify_initial_equipment_state.mjs を追随。8ケースを削除せず、旧5directINSERT成功/部分失敗の期待を『RPC結果とは独立の保存済再SELECTだけを投影』へ変更した。SQL原子性は別15群で確認するため、部分成功ケースは『応答不明でも確認済rowsだけ維持』に置換。全0/選択クリア/空RPC/null/error+data/キャラなし/再login非重複/反復失敗の意図を保持し、read失敗を0扱いしないこととUI/power同equipsDataも確認する。更新後8/8 PASS、対象eslint0 errors/0 warnings。今回は合計9縦接続＋15正式SQL＋8既存投影で32検証群/ケース。実機/HTTP検証数ではない。
