# Raid Room 第4工程 ローカル条件検証

実施日: 2026-09-08。TASK ID: RAID-C-04。状態: VALIDATED（親レビュー・同runner再実行済み）。基準SHA: `5f6da8b8cbf524bc1839de5e1828fa8ba39fae07` に対する作業中差分。

`20260908000251_raid_room_condition_rules.sql` 本体を文字列置換・加工せず、ローカルメモリDBへ適用して検証した。14テストがPASS、失敗・skipは0件。テスト内の反復入力は独立テスト数へ重複計上しない。

## 実行方法・環境

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-condition-rules-run.mjs
```

PGlite 0.5.8 / PostgreSQL 18.3（WASM）、既存scratch runtimeのtsxを使用。runnerは外部接続URL・資格情報を受け取らず、`new PGlite()` の一時DBのみ使用する。package/lockへの変更なし。fixtureはanon/authenticated/service_roleとPUBLIC権限継承確認用role、public schema使用権限のみを準備する。

検証対象Migration SHA-256: `4f422f2dc7323d0a501640daed0c71fb7e236cffb6b5ec8de012927a76ec48ab`。
比較対象 `src/domain/raidRoom.ts` SHA-256: `18d8097c6ae0639bee88f2b68a1383b17fadae808b60a135f06cb8464a6d0fd4`。

## 検証結果

|検証|結果|
|---|---|
|4難度の初期設定|PASS。初級NULL、中級160000、上級200000、超級240000。救援閾値は全件NULL、版1|
|SQLと既存TSの総合力結果|PASS。共有入力23組でJSON完全一致。3難度の直前・一致・直後、初級NULL/負数、未知難度等|
|bigintへの不正入力|PASS。非整数文字列、NaN/Infinity、範囲外は22P02/22003エラー|
|bigint精度・CAST境界|PASS。最大bigintはSQL内のtext取り出しで精度保持。numericの159999.9を明示bigint CASTすると160000になることを実測|
|救援の未設定・未知難度|PASS。未設定を0へ補完せずunknown、必要閾値NULL|
|救援AND|PASS。経由/戦数/Contribution Damage/CLEARの真偽16組を検証。一致のみと両数値超過も確認|
|救援の不明・負数|PASS。必須値の各NULLと負数はunknown。他のfalse条件でもunknownを保持|
|救援閾値0|PASS。NULLと区別。0/0でも救援経由とCLEARは必要|
|片側閾値だけ設定|PASS。両方設定されるまでunknown|
|不正設定・設定行欠落|PASS。負数・版0は制約拒否。既知難度の行欠落はunknown|
|権限|PASS。PUBLIC継承role/anon/authenticated/service_roleにtable権限・helper実行権限なし。実行も42501拒否|
|RLS|PASS。有効、policyなし。一時的にSELECT grantだけ与えてもauthenticatedへ行を返さない|
|READ ONLY|PASS。STABLE、search_path=pg_catalog、READ ONLYトランザクションで実行し設定不変|
|再適用|PASS。救援閾値と版を変更した後もMigration再適用で上書きしない|

救援閾値3戦/100 Damage、0/0、再適用用7戦/1234 Damageはローカルテスト専用値。ゲームバランスの採用値・seedではない。

初級の負数は既存TSに合わせ `actualPower:null`、`passed/no_power_restriction`。総合力条件だけの通過でありRoom参加許可ではない。救援`succeeded`も報酬権利・付与成功ではない。

## 検証の限界

実DB、PostgREST/JWT、既存Migration全件、実環境のdefault privileges・ロール継承・拡張設定は再現していない。サービスロールの未公開判定はこの最小fixtureにおける結果。実環境適用時には実際の権限を別途確認する必要がある。

SQL/TSの一致は初期設定と共有整数入力の範囲。TSは有限小数を許すがSQLはbigintであり、明示CASTで丸めた後に元の小数入力を検出できない。将来のwriterはCAST前の整数検証とサーバー正本の取得が必要。bigint全域をJavaScript Numberへ安全に変換できるという検証ではない。

Room生成・参加確定・救援帰属・戦闘・報酬・Present・公開RPC接続は本検証の対象外。Preview、ブラウザ、実機は未確認。外部DB操作・Deploy・コードcommit/pushは行っていない。
