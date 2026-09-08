# Raid Room 第4工程 条件判定契約

記録日: 2026-09-08。基準SHA: `5f6da8b8cbf524bc1839de5e1828fa8ba39fae07`。
対象: `20260908000251_raid_room_condition_rules.sql`。非公開helperの準備であり、Room生成・参加確定・救援帰属・報酬発行は含まない。

## 設定

`public.raid_room_difficulty_rules` は難度を主キーに次を保持する。

|difficulty|minimum_power|rescue_min_battles|rescue_min_contribution_damage|rule_version|
|---|---:|---|---|---:|
|beginner|NULL|NULL|NULL|1|
|intermediate|160000|NULL|NULL|1|
|advanced|200000|NULL|NULL|1|
|expert|240000|NULL|NULL|1|

`minimum_power` は初級だけNULL、他は非NULL・非負数。救援閾値はNULLまたは非負数、版は正の整数。0を設定することとNULL（未設定）は区別する。救援の仮置き候補値は登録しない。設定値はbigintで保持し、再適用のINSERTは既存行を上書きしない。既存マスターは変更しない。

RLS有効、公開ポリシーなし。PUBLIC・anon・authenticatedの全テーブル権限を剥奪する。設定を変更する公開APIやサービス向けGRANTは追加しない。将来の権利確定処理は使用した設定版と条件を保存し、設定変更時に過去の権利を再判定しない設計が必要。現時点では版自動更新・履歴・権利保存処理は追加しない。

## 総合力条件

`_raid_room_power_gate_v1(p_difficulty text, p_power bigint) returns jsonb`

返却は `status`（passed / failed / unknown）、`minimumPower`、`actualPower`、`reason` の4フィールド。`actualPower` は非負入力、NULL/負数ならNULL。

|条件（上から優先）|status|reason|
|---|---|---|
|難度がNULLまたは未知|unknown|invalid_difficulty|
|既知難度の設定行が欠損|unknown|rule_unavailable|
|初級（下限NULL）|passed|no_power_restriction|
|中級以上、総合力NULL|unknown|power_unavailable|
|中級以上、総合力負数|unknown|invalid_power|
|下限以上|passed|meets_minimum|
|下限未満|failed|below_minimum|

初期設定・共有整数入力の範囲では既存 `evaluateRaidPowerGate` と一致する。初級はNULL・負数でも総合力条件のみpassedとなる（負数の扱いは親決定で既存TSへ一致）。参加資格全体のeligibleとは異なる。設定行欠損時のunknownはSQL追加防御。設定を変更した場合、表示側TSの固定下限と一致しなくなるため、接続前にサーバー設定への表示統合が必要。

## 救援成功条件

`_raid_room_rescue_gate_v1(p_difficulty text, p_via_rescue boolean, p_finalized_battles bigint, p_contribution_damage bigint, p_room_cleared boolean) returns jsonb`

返却は `status`（succeeded / not_succeeded / unknown）、`reason`、`ruleVersion`、`minimumBattles`、`minimumContributionDamage`。設定行が取得できなければ設定の3項目はNULL。入力未取得や不正を0へ補完しない。

|条件（上から優先）|status|reason|
|---|---|---|
|難度がNULLまたは未知|unknown|invalid_difficulty|
|既知難度の設定行が欠損|unknown|rule_unavailable|
|救援閾値のいずれかがNULL|unknown|thresholds_unconfigured|
|戦数またはContribution Damageが負数|unknown|invalid_input|
|必須入力のいずれかがNULL|unknown|input_unavailable|
|救援経由 AND 戦数が下限以上 AND Contribution Damageが下限以上 AND Room CLEAR|succeeded|conditions_met|
|全値既知・正常だが上記AND不成立|not_succeeded|conditions_not_met|

初期設定では救援成功を確定しない。CLEAR=falseなど一つの条件が不成立でも、他の条件が不明ならunknownを優先する。成功判定は報酬権利作成・付与を意味しない。呼出側は確定ログ等のサーバー正本から戦数・Contribution Damageと救援経由・CLEARを取得する。未確定戦、画面上の合計、クライアント送信値を正本として採用してはならない。救援の帰属・集計開始時点とContribution Damageの採用列は未確認であり、本helperは独自に決めない。

## SQL型境界と公開範囲

両helperはSTABLE・SECURITY INVOKER、`search_path = pg_catalog`、テーブルを`public`で完全修飾する。PUBLIC・anon・authenticatedのEXECUTEを剥奪し、サービスロールへの追加GRANTも行わない。将来の認可済みwriter内部から呼ぶための関数であり、公開RPCやユーザー資格の検証経路ではない。

bigintの範囲は -9223372036854775808〜9223372036854775807。範囲外整数文字列、非整数文字列、NaN/Infinity文字列はSQL型変換でエラーとなりJSONを返さない。SQLでnumericから明示CASTした小数はPostgreSQLにより丸められてからhelperへ入り、元の小数入力だったかは検出できない。将来の呼出側はCAST前に整数性を検証する。TSは有限小数も許すため、SQL bigintとの整合保証は整数入力のみ。JavaScript数値へ変換する経路では安全整数上限9007199254740991を超える値をそのままNumberへ変換しない。

型境界の例は公開入力として許可する意味ではない。現在の画面・DTO・参照RPCのserverEligibilityは変更せずunknownを保持する。総合力判定対象の編成・時点が決まってからサーバー正本取得と参加writerを接続する。

## 検証範囲

C-04がPGliteにMigration本体を適用し、初期設定、境界、救援AND、未設定、不正値、権限、読取専用性、再適用保持を検証する。親レビューと再検証によりVALIDATED。詳細はraid_room_phase4_integration.md。ローカルSQLエンジン検証は実DB、PostgREST/JWT、Preview、実機検証とは区別する。外部DB操作・Deployは行っていない。
