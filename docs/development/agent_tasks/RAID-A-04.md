# RAID-A-04
TASK ID: RAID-A-04
OWNER: raid_a_phase4
STATUS: VALIDATED
SCOPE: supabase/migrations/20260908000251_raid_room_condition_rules.sql、docs/development/raid_room_condition_contract.md。排他的DB Migration担当。
確定総合力下限と救援成功AND条件の非公開サーバー判定を実装。新規raid_room_difficulty_rulesテーブルは4難度・minimum_power（初級null、他160000/200000/240000）・rescue_min_battles・rescue_min_contribution_damage（2項目とも初期null）・rule_versionを保持する。制約/RLS/default denyを設定。救援の候補数値はseedしない。既存マスター変更なし。
非公開helper _raid_room_power_gate_v1(p_difficulty text,p_power bigint) returns jsonb は既存evaluateRaidPowerGateのstatus/minimumPower/actualPower/reasonと一致。未知難度はunknown、初級power不明でもpower条件のみpassed。中級以上の不正負数はunknown。初級の負数は既存TSと同じくactualPower:nullのpassed/no_power_restriction（参加許可全体ではない）。SQL引数の非整数/範囲外の仕様は契約で明記。
非公開helper _raid_room_rescue_gate_v1(p_difficulty text,p_via_rescue boolean,p_finalized_battles bigint,p_contribution_damage bigint,p_room_cleared boolean) returns jsonb は設定/信頼済みサーバー集計値を参照してAND判定。statusはsucceeded/not_succeeded/unknown。閾値未設定・必須値null/不正はunknownで、未確定戦やUI計算値の正本化は禁止。全値既知でAND不成立はnot_succeeded。一致以上は閾値通過。reason、ruleVersion、必要閾値を返す。報酬発行・現在編成取得・公開RPCなし。
全helperはPUBLIC/anon/authenticatedからEXECUTE revoke。サービス権限へ公開grantも不要。安全なsearch_path、stable readonly。将来writerはサーバー正本を取得して呼ぶ必要がある。SQLと契約をBへ早期共有。
PRIORITY: P1
DO NOT TOUCH: 既存Migration、戦闘/Replay/報酬/認証Authority、既存UI/DTO、package/lock、外部DB、Deploy。commit/pushは親のみ。
DEPENDENCIES: .agents/AGENTS.md → release_board.md → 本契約、codex_parallel_protocol.md、specs/raid_room_rescue_v1.md。
ACCEPTANCE CRITERIA: 総合力条件と参加許可、救援成功条件と報酬権利を分離する。未確認値を推測せず未設定として保持。公開RPCへクライアント算出power/Damageを渡して権利を得る経路を作らない。
VALIDATION: ローカルPGliteでMigration本体実行、境界/不正/未設定/権限を検証。実環境適用と区別。
EXPECTED OUTPUT: 指定範囲の差分とProtocol準拠Completion Report。親レビュー前はIMPLEMENTED。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 基準5f6da8b8cbf524bc1839de5e1828fa8ba39fae07
BLOCKERS: Room生成上限の単位/費用/期限、判定対象編成/時点は未確認。生成・参加・報酬writerは今回対象外。

親レビュー・機械検証済み。根拠: raid_room_phase4_integration.md。Human PASS・新Raid全体完了ではない。
