# Raid第15工程 検証記録

2026-09-08 / RAID-C-15 / 子担当実装・検証完了、親レビュー待ち。

## 対象

- `20260908000261_raid_ranking_retirement.sql` SHA256 `4871b9843104f635b64f5d4800cd8d8280a8915111540ca334f00544457ac542`
- RankingTabのレイドカテゴリ撤去・旧カテゴリ互換遷移・順位報酬表示停止。
- レイド順位報酬の新規生成だけを停止し、既存Presentと他カテゴリを保持。

## 実行結果

| 実行 | 結果 |
|---|---|
| `RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-ranking-retirement-run.mjs` | SQL 8件PASS |
| `RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-ranking-retirement-tests.mjs` | React/報酬表示 5件PASS |
| `git diff --check` | PASS |

SQL engine: PostgreSQL 18.3 / PGlite 0.5.8 (WASM)。React 19.2.4 / JSDOM 26。外部DB・資格情報を使用せず、一時メモリDB内の各ケースをROLLBACK。

## SQL確認内容

1. 個人/Guild順位参照がRETIRED・空配列。未認証は拒否。
2. Raid Season advance/finalizeの書込みなし、既存Season保持。ACTIVE参照はPvP保持・Raid除外。
3. PvP期限境界の既存3処理呼出しと新Season生成を保持。Raid期限行は変更しない。
4. Season・日次・canonical旧Instance・legacy master指定の順位報酬直接入口を呼んでも新規台帳/Presentなし。
5. 共有日次finalizeはPOWER/GUILD_POWER/PVP各1人・計6品目を付与。既存Raid recipient snapshotが残っていてもRaid新規付与なし。再送で増加なし。
6. Raid戦闘確定は日次順位参加を追加しない。PvPは1回のみ記録し再送重複なし。
7. 既存Raid Presentに実際の135 `claim_present` / `grant_present_payload`を適用し、CASH増加・CLAIMED・再受取拒否を確認。PvP Seasonの実grantは1回だけ新規Presentを作る。
8. 本人貢献readは旧日次合算/Room単位、他人ダメージ除外・順位なし。admin旧resetでもHP/ログ/Presentを変更しない。

## 画面確認内容

1. 実RankingTabのカテゴリは総合力・ギルド・バトルを保持、レイドなし。
2. ギルド順位RPC呼出し保持。
3. PvP順位RPC呼出し保持。
4. 旧`rankingActiveTab=raid`入力は順位RPCなしでレイド画面へ遷移、カテゴリをpowerに戻す。
5. 旧Raid順位報酬payloadが届いてもdaily/season表示なし。POWER/GUILD_POWER/PVPの日次報酬section保持。

## 検証範囲と限界

- SQL261本体、日次付与・Season付与・Present受取は実関数を実行。依存テーブルは229/233/234のCREATE TABLEを読込み、それ以外は専用最小schema。canonical reward payload・item resolverはfixture。CASH等の数値はテスト専用で製品設定ではない。
- PvP境界のassert/finalize/reconcile helperは呼出し記録double。PvP内部戦闘や報酬仕様全体の再検証ではない。
- SQLケースは主にDB ownerで実行しauth.uid値を設定。未認証条件を確認するが、全既存ACL/RLSの実環境再現ではない。既存CREATE OR REPLACEのACL保持は親レビュー範囲。
- Reactは実RankingTab・共通UIをrender。GameContext、RPC、画像readiness、ResizeObserverをdoubleとしCSS実描画なし。RaidTab/GameContextの広範な実機起動・視覚確認を代替しない。
- 過去工程のSQLテストは各工程当時のmigration範囲を固定した検証で、旧順位参加を期待するケースを含む。今回の廃止後挙動は本SQL261検証を正本とする。
- 実DB、実Cron、複数接続競合、実機、Production/Preview反映は未実施。討伐報酬実装・数値設定も別工程。
- 全体型検証・Mock build・既存Room回帰の親実行結果はphase15_integration.mdへ記録する。
