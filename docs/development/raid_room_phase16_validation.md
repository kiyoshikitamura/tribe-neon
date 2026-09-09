# Raid第16工程 検証記録

2026-09-08 / RAID-C-16 / 子検証完了・親レビュー待ち。

対象SQL: `20260908000262_raid_room_clear_rewards.sql`
SHA256: `9560d00c2a95b06bb65acc2602841ee982bed4e706705a27dcf31b1e67dc3342`

## 実行結果

| 実行 | 結果 |
|---|---|
| `RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-clear-reward-run.mjs` | SQL 10件PASS |
| `node --experimental-strip-types --test tests/raid-room/clear-reward.test.mjs` | adapter 3件PASS |
| `RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-clear-reward-tests.mjs` | 実React 4件PASS |
| `git diff --check` | PASS |

SQLはPGlite 0.5.8 / PostgreSQL 18.3 WASM。一時メモリ内で実行、各ケースROLLBACK。外部DB/資格情報不使用。

## SQL 10件

1. 未設定は撃破後もPresent未発行。
2. 累積99→100→101、閾値100の未満/一致/超過を確認。超過のみでも未討伐なら未発行。
3. 他人の撃破で、ACTIVE中101確定済み通常参加者と撃破した主催者へ各1回送付。送付から30日期限。
4. 撃破打28000000を計上。実撃破Replayの`finalized_at >= outcome_finalized_at`でも対象（clockの時刻解像度で同値を許容。終了時刻未満の単純比較では除外される撃破打）。後確定は`lateFinalization=true`・貢献0で対象外。
5. 撃破時100一致、後確定1を足しても討伐資格は得られない。
6. TIMEOUTと期限後確定は未発行。
7. 確定再送でPresent増加なし。実`claim_present`でCASH更新・CLAIMED、他人受取/再受取拒否。
8. 期限切れ受取・直接台帳参照・内部発行・未認証参照を拒否。
9. 同本人・同Room・同CASHで討伐/救援報酬を共存。`RAID_ROOM_CLEAR`と`RAID_ROOM_RESCUE`が別Present、確定再送で増加なし。
10. 終了前開始/終了後確定は救援成功報酬だけ対象で、討伐報酬とは別判定。

ケースは250〜260と262の実migration、144結果検証、135 Present実関数を使用する。実256 finalizer→262 trigger→Presentの経路を通り、lateFinalizationをfixtureから直接指定していない。ランキング停止261はこの報酬fixtureに読込まず、前工程の独立検証範囲とする。

## adapter / 画面

- 本人参照RPCのみ。Room違い/欠損/数量0/不正閾値/不正outcomeを拒否。
- 未設定と通信エラーを区別。
- 未設定で仮数量やPresent遷移を表示しない。
- 討伐報酬見出し・閾値超過・終了後確定除外・明細を表示。
- Present取得失敗時の再試行と二重タップ抑止。
- 本人切替で旧明細を表示せず新取得を待つ。

## 範囲・限界

- schemaや周辺依存は既存専用fixture、キャラ/編成/装備/masterはテスト用。閾値100、CASH19/37は検証用で製品設定ではない。
- PGliteは単一接続。実DB・実Cron・複数接続競合・実機・Deploy未実施。
- Reactは実panel/OutlawButton、GameContextのみdouble、CSS実描画や製品全体の認証遷移を代替しない。
- 主催者/通常参加者/救援者へ自動Present送付30日は今回の実装前提。品目・数量・閾値の本番投入と運用有効化は未実施。
- 全体型/buildと既存Room回帰の親結果は `raid_room_phase16_integration.md` に記録する。
