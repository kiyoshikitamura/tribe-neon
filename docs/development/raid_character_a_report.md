# RAID-CHAR-A 統合レビュー・検証

対象: Raid `9fe5909c024f649c47ec8402409936cd79fd1a37` + Character `a02754c98c1d927e36ecdb46d7ac55541828a346`。専用worktree `game03-tribe-neon-raid-character-integration`、統合候補で今回新規実行した結果。旧ブランチのPASSを転記していない。

## 採用・保持レビュー

- Character側から CharacterHome.tsx/.css、characterHomeSelection.ts、CharacterSystemV2.tsx/.css を採用。5ファイルは a02754c と一致しており、Aは製品コードを追加修正していない。
- CharacterSystemV2の変更はLIST→HOME、初期master ID受付、フィルター内選択・矢印/gesture、育成/LOADOUT/PARTYからHOMEへの帰路、一覧の個人総合力表示が中心。
- 育成・覚醒・スキル装備・装備変更・編成の既存handlerは保持。CharacterTab.tsxの `!isTutorialStep → CharacterSystemV2` 分岐はRaid基準と同一。Tutorial側へのHOME混入なし。
- 総合力は既存getCharacterTotalStatsのHP+ATK+DEF。stats_calculatorとcanonical計算/マスターはRaid基準から変更なし。
- CharacterHomeの編成状態はget_current_main_formationの保存済み結果を参照し、Contextの表示fallbackを採用しない。装備数は所持instance UUIDに対するequipped_character_id一致、選択identityはmaster character_idで区別。
- 必要依存は既存CharacterPresentation/共通OutlawButton/画像・背景・GEAR_SLOTS_MASTER/read RPC。GameContextのGacha category追加はこの表示/計算経路を変更しない。

## 今回の検証結果

| 実行 | 結果 |
| --- | --- |
| `node scripts/verify_tutorial_character_parity.mjs` | PASS、canonical60体とreveal/Mock rarity |
| `node --experimental-strip-types scripts/verify_character_awakening_copy_equivalent.mjs` | PASS、覚醒copy-equivalent曲線/累積/既存Cash条件 |
| `node --experimental-strip-types scripts/verify_mock_secure_skill_loadout.mjs` | PASS、所有・slot・専用/複数装備関連 |
| `node --experimental-strip-types scripts/verify_post_tutorial_loadout_guide.mjs` | PASS、無料Skill/Equipment・推奨編成/装備とmilestone |
| `node --experimental-strip-types scripts/raid-character/verify-character-contract.mjs` | PASS、9群。現master専用装備拒否・無副作用、bulk二枠、identity維持/順序変化/消失/空、復帰fixture off/on/他RPC非干渉 |
| CharacterHome/selection/SystemV2 `eslint --quiet` | PASS、0 errors |
| `post-tutorial-loadout-guide.spec.ts`（3015、Chromium、390px、明示fixture補完後） | 1 PASS / 1 FAIL。Skill→Equipment→party/育成入口→PvPの導線はPASS |
| `verify_mock_secure_equipment_loadout.mjs` 既存script | 初回FAIL → canonical fixtureへ最小更新後PASS。所有/slot/専用制約、拒否時在庫保護、bulk四枠を確認 |

Character HOME全8件・Fresh Journey・幅/短画面の最終ブラウザ検証はC担当報告を参照。型/build/全体lintは親担当。Aの独立scriptはインメモリMockのみでDBへ接続しない。

## 既存試験の不一致と補完

### 装備script

既存scriptはローカルequipment_battle_masterへ架空の `WEAPON_EX` を入れて専用制約42501を期待する。現在mockRpcはCANONICAL_EQUIPMENTSを参照するため当該masterが存在せず、先行チェックでP0002になる。script/mockRpc（今回の限定read fixture以外）/計算はRaid基準の同じコードであり統合による専用制約破壊ではない。期待を緩和せず、新規独立scriptで現masterの専用装備を選び42501と在庫無変更を確認した。親の追加依頼により既存scriptも修正。CANONICAL_EQUIPMENTSから本人以外専用の実武器を選び、無効なローカルmaster上書きfixtureを除去。拒否時の在庫不変assertを追加し、元の単体装備/slot型拒否/他人所有拒否/専用制約拒否/bulk四枠成功をすべて再実行してPASS。製品装備処理は変更していない。

### post-loadout browser

初回2FAILのうち1件目は起動時に未実装 `list_raid_room_battle_recoveries_v1` がdata:nullを返し、実useBattleが「出撃履歴を確認できませんでした」エラーを表示してCTAを遮った。LoginBonusではなかった。

親がMockへ明示opt-in `mock_rpc_fixture:empty_raid_recoveries=true` を追加し、この試験の新規ユーザーが過去のレイド出撃履歴を持たないことだけを[]で補完。進行完了、資源、フラグを強制せず、他RPCの返値は変更しない。AがbeforeEachでこのkeyを指定して再実行し1件目PASS。これは実HTTP/実DBのReplay復帰確認の代替ではない。

2件目は旧 `mock_db_raid_bosses` のみをseedして「開催中レイドへ」を要求するが、現在のGameContextはRoom UI時にroomActivity.isActiveを参照し、旧seedだけでは新一覧の活動投影を満たさない。結果は「ギルドに加入しよう」。HomeTab/活動判定はRaid基準から変更なし。テストの意図を変えてPASSにせず、旧fixtureと現在の参照契約の不一致として残した。新Room活動fixtureでのRaid→Guild→Mission browser検証は未完了。

証跡: `outputs/a-post-loadout-rerun/` に失敗スクリーンショット/error-context/trace。初回は `outputs/a-post-loadout/`。

## Aの変更と未実施

追加: `scripts/raid-character/verify-character-contract.mjs`、本報告。
変更: `tests/e2e/post-tutorial-loadout-guide.spec.ts` の新規履歴なしopt-in fixture、および `scripts/verify_mock_secure_equipment_loadout.mjs` のcanonical専用装備fixture/拒否時在庫保護assert（いずれも親の担当許可あり）。
製品コード変更なし。commit/push/Deploy/DB/Edge/Cron/運用設定/共有alias変更なし。実機受入は未実施。
