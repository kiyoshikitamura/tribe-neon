# Production PvP opponent overflow 調査・修正

## 原因と差分

分類: **C. RPC implementation bug**。正常な総合力を integer のまま10000倍していた。

`get_pvp_opponents_page(uuid,integer,integer)` の candidates CTE、match_tier 1/2 の条件内2箇所:

```diff
- coalesce(power.total_power,0)*10000
+ coalesce(power.total_power,0)::bigint*10000
```

Production の `user_power_rankings.total_power` 最大224561。10000倍は2245610000で、integer上限2147483647を超える。`calculate_user_total_power`による正規再計算も224561。一方Preview最大173702で、この乗算の上限に達していなかった。総合力の保存値・Formula・倍率・selection ruleに異常/変更なし。

参考: [PostgreSQL 17 numeric types](https://www.postgresql.org/docs/17/datatype-numeric.html)。値を格納する変数がbigintでも、別のinteger同士の乗算が自動的にbigintになるわけではない。乗算**前**の型拡張が必要。

## 再現

引き継ぎ証跡 `normal-production-rpc-parity.json` の同一引数:

```json
{"p_user_id":"a8cb4e0c-2138-466d-9ed8-0630151db27c","p_my_points":1000,"p_offset":0}
```

3bdefed配信と550c022配信の両方でHTTP400:

```json
{"code":"22003","details":null,"hint":null,"message":"integer out of range"}
```

このQAアカウントは調査時点でauth.users / public.usersから削除済み。UUIDだけをauth contextに入れた呼出は自分の総合力がNULLになり、OR短絡で乗算を通らず成功する。この成功を当時アカウントの復旧検証とは扱わない。

現存ユーザー `311eaad0-252f-4b9c-b95e-433f151bf3c9` (points1298,offset0)、`db442bdf-0b8a-41a3-89b5-c5cd0bdd5f6d` (points1226,offset0) の両方でREAD ONLY + authenticated role/contextを用いて22003再現。PostgreSQL CONTEXTは function line34 / candidatesを含むWITH文。224561を用いた乗算単独でも22003再現。

## 定義・型・履歴比較

- Production / Previewの修正前 `pg_get_functiondef` はバイト一致、MD5 `0e14d5a126a5efea924a6de341006f97`。
- 修正後MD5 `636f7e768a3a554ba2b4a7f02f4bf372`。
- 関連列型は両方同一。total_power、rank_points、winsはinteger。user_idはuuid。timestamp列はtimestamptz、activity_dateはdate。
- Production RATE範囲992〜1298、daily wins最大14、power行148。countはinteger上限から十分小さい。page offsetは0〜10000、next offset加算は5。dense_rankはbigintのままJSON化。seed/hash/random/UUID数値化/epoch変換は本RPCにない。
- `v_my_power` は元からbigint。倍率7000/14000/5000/18000側はbigint演算。RATE helperは両環境一致。
- Production履歴は20260904000241 snapshot baselineから開始。Previewは個別migration履歴。履歴の形式は異なるが対象RPCの実定義差はない。古いProduction functionや今回未反映migrationが原因ではない。全schemaの一致を主張するものではない。
- snapshots / migration histories: [database-evidence.json](database-evidence.json)。今回と無関係な履歴の一括反映なし。

## 本番適用前検証

- Production実データに対する同一transaction内 CREATE OR REPLACE + ROLLBACK。148ユーザー、offset 0/5/10000、444呼出。381件の22003が解消、元から成功した63件はJSON完全一致。
- Preview19ユーザー×3条件、57件すべて変更前後JSON完全一致。
- Production444件すべて、同じ既存定義の該当乗算をnumericで評価した参照結果とJSON完全一致。件数、filter、順序、page wrap、tier、RATE deltaを包含。
- 全変更をROLLBACKした後にProduction旧定義MD5を再確認。
- 認証必須 / 負offset拒否を確認。SECURITY DEFINER、search_path、権限は保持。anonには対象RPCのEXECUTEなし。
- Preview/ProductionのSecurity advisors実行。対象RPCにはauthenticatedのSECURITY DEFINER呼出に関するWARNがある。これは元から許可されている意図した経路であり、auth.uid照合を保持し、ACLも変更前後一致。権限変更・RLS変更なし。他の既存指摘の修正は本件外。[該当advisor説明](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

## 適用・画面検証

Preview: `20260909002512_pvp_opponents_power_multiply_bigint` 適用済み。
Production: `20260909003245_pvp_opponents_power_multiply_bigint`、2026-09-09 09:32 JSTに適用済み。
CLIで生成したmigrationファイルは、本番Management APIが採番した実versionに合わせてファイル名を正規化。Previewは同じfunction変更でAPI採番versionが異なる。両方の実定義MD5は一致。

Preview実画面: 相手5件、Rival切替、My/Rival Deck、Start、Ready、PvP、Result、ランキング経由でBattle TOP帰還を確認。BP5→4、RATE1000→992、表示済みloss delta -8と一致。`start_pvp_battle` HTTP200は1回。認証・ランキング検証には既存RPCを使用。

Previewスクリプト全体は帰還後の対象外Raid背景固定assertで失敗したが、上記PvP経路は通過し、Result/帰還スクリーンショットとRPC応答に記録。初期試行の初回案内dialog待ち・検証用pvp_ranks直接SELECT拒否も検証スクリプトだけを調整して解消。ゲームコード・権限に変更なし。

Production反映直後、修正前に失敗した現存ユーザーで直接RPC PASS (items5,total127,next5)。RATE helper2関数・start_pvp_battleのMD5、対象RPCのACL/search_path/security modeが変更前と一致。

Production実画面: `https://www.tribe-neon.com/` で新規QAアカウント作成、通常tutorial完了後に相手5件取得。Rival切替、Deck確認、Start、Ready、実PvP1戦、Result、ランキング経由のBattle TOP帰還までPASS。開始RPC HTTP200は1回。BP5→4、RATE1000→992 (敗北-8)、帰還後の相手RPC HTTP200/5件。DBの読取りでもBP4/RATE992確認。スクリーンショットを実見しResultと帰還を確認。

補助的な演出監視ではnormal/skill/defeatを検出したがimpact/damageは検出できず、スクリプト全体のexitは1。今回は演出変更を行っておらず、演出全項目PASSとは報告しない。ユーザー指定の相手取得→実PvP→Result帰還/BP/RATE経路の通過は、RPC記録と画面証跡で個別確認済み。不要な追加対戦は行わなかった。

PreviewとProductionで作成したQAアカウントは検証後、既存の `discard_current_anonymous_account_for_switch` RPCで削除。既存ユーザーの資産・RATEを検証用に書換える操作はなし。テストアカウントの通常対戦・通常進行による更新のみ。

配信アプリSHAは依頼時の550c02225cbecb6ba6f174ee3fb952bcaae2f6ddを基準とし、アプリの再deploy/alias変更なし。本修正はDB関数とそのmigration/証跡のみ。

## 復旧手順

この変更はデータや列型を変更しない。緊急に関数だけ戻す必要がある場合は `production-before.sql` の旧定義を単一transactionで復元できる。ただし旧定義では今回のoverflowが再発する。

## 残事項

- 削除済みの旧QAアカウントそのものは再検証不可。現存ユーザーの実データ再現と新しいQAアカウントの実画面で検証する。
- 旧 `get_pvp_opponents` にも同じ乗算が残る。現行srcの実RPC呼出はpage版のみ（旧名はmock互換分岐だけ）。今回の対象functionに限定し、旧RPCは変更していない。
