# GAME03 / TRIBE NEON — Quest CASH Hotfix Canonicalization

Quest CASHの正規化を実装・検証済み。対象範囲ではRepository Canonical = Migration = Production Runtime。
Productionは読み取りのみ。Previewには今回のMigrationだけを適用し、同じSQLの再実行でも状態が変化しないことを確認した。

| Difficulty | Quest数 | cashReward / cash_reward | dailyFirstClearCash / daily_first_clear_cash |
| --- | ---: | ---: | ---: |
| EASY | 7 | 600 | 0 |
| NORMAL | 7 | 1,200 | 0 |
| HARD | 7 | 2,000 | 0 |

## 変更ファイル

- `src/domain/gameplay/canonical/data/quests_20260830.json`: Difficulty Contract 3件とQuest row 21件のCASHを同期。その他のJSON値は変更前と完全一致。
- `supabase/migrations/20260908163303_quest_cash_hotfix_canonicalization.sql`: 新規Migration。既存Migrationは変更していない。
- `src/utils/mock/mockRpc.ts`: Quest CASHをclaim時に直接残高へ反映。CASHプレゼントとHARD初回20 CASHの発行を廃止。Item・EXP・Mission処理は維持。
- `src/app/context/GameContext.tsx`: Master取得を現行versionへ固定。DB Masterが取得できないときの既存IDのCASH表示もRepository Canonicalへ接続。表示コンポーネント・レイアウトは変更なし。
- `scripts/verify_master_freeze_20260830.mjs`: 全21件と3 ContractのCASHを検査。
- `scripts/verify_mock_quest_production.mjs`: 現行報酬Contractへ期待値を更新し、全21件の残高・8同時Claim・accrued・旧追加CASH不発を検査。
- `scripts/verify_mock_secure_patrol.mjs`: 直接入金と再Claim無作用を検査。
- `scripts/verify_canonical_master_preview_acceptance.mjs`: 廃止されたHARD初回20 CASHを期待しないよう更新。
- `scripts/verify_quest_cash_preview.mjs`: Preview固定・Fresh User使用の実Runtime試験。生成fixtureは削除する。
- `package.json`: `verify:quest-cash:preview`を追加。
- 本報告書と`quest_cash_hotfix_20260909.json`: 照合結果・関数ハッシュ・実測残高を記録。

## Migration / Runtime差分

`canonical_quest_master`の現行versionと互換`quests.cash_reward`だけを更新する。`IS DISTINCT FROM`により同値rowへの不要なUPDATEを避ける。
対象2関数はProductionの`pg_get_functiondef`から取得した定義と一致する。関数権限と既存Triggerの接続を維持し、HARD初回Trigger関数は`return new`のみとなる。

claimはCanonical CASHを読み取り、所有者のPatrol行を`FOR UPDATE`でロックし、`COMPLETED`なら`23505`で拒否する。残高加算・Item発行・EXP・accrued保存・完了状態・Mission進捗は同一RPCトランザクション内。responseとaccruedのcashは同じ実付与変数を使う。

Production / Migration / Previewの関数ハッシュ比較はSQL文末の区切りセミコロンを除外し、CRLFをLFへ正規化した。
全21件のCASH、互換quests 21件のCASH、対象2関数の定義と権限の差分は0。
Preview再適用前後のMaster・互換quests・対象関数も同一。Productionの対象状態は作業開始時と終了時で同一。

Quest duration、Energy/Vitality cost、EXP、Item Pool、Enemy Pool、その他のDB関数、既存Triggerは適用前後で同一。
Encounter、Mission、Raid、Gacha、Character / Skill / Equipment CASH Sink、Guild Economyの実装と設定は変更していない。

## Legacy scan

`src / scripts / supabase / tests / masters / config`を検索し、報酬表示からMasterへの参照と、Migration順序で最後に有効となる関数を確認した。

- 現行`quests_20260830.json`に0 CASH報酬・HARD初回20 CASHは残っていない。
- `src`の実行処理に`QUEST_HARD_FIRST`、HARD初回20 CASH発行処理は残っていない。
- `src/domain/gameplay/canonical/quests.ts`は現行JSONを参照。`DISPATCH_COURSES`もこのCanonicalから生成する。
- 既存UIは`reward_cash`を表示。DBのversion無指定取得が旧値混入の原因になり得たため修正した。
- 最終Migrationのclaim response / accruedは`cash=v_cash`。`coalesce(cash_reward,0)`はProductionと同一のNULL防御であり、固定0報酬ではない。
- Productionのpublic関数を検索しても`QUEST_HARD_FIRST` / `daily_first_clear_cash`参照による別付与処理は0件。
- `quests_20260822.json`の300 / 700 / 1,300、旧Migration、旧版生成・検証スクリプトは履歴として維持。現行アプリは旧Quest JSONをimportしていない。

## 検証結果

| 検証 | 結果 |
| --- | --- |
| `verify:master-freeze-20260830` | PASS、全21 Quest |
| `verify:canonical-gameplay-foundation` | PASS |
| `verify:canonical-runtime-integration` | PASS |
| `verify:canonical-battle-runtime` | PASS |
| `verify:canonical-missions` | PASS |
| `verify:mock-user-resources` | PASS |
| `verify:mock-quest-production` | PASS、全21件×8同時Claim |
| `verify:mock-secure-patrol` | PASS |
| `verify:quest-cash:preview` | PASS、Fresh User、実RPC・Edge Function |
| `typecheck` | PASS |
| `build` | PASS、Preview設定を環境変数として渡して実行 |
| `git diff --check` | PASS |
| Preview Migration適用・再実行 | PASS、再実行後の対象状態不変 |

| Preview実測 | 残高before | CASH実付与 | 残高after | response / accrued |
| --- | ---: | ---: | ---: | ---: |
| EASY | 1,234 | 600 | 1,834 | 600 / 600 |
| NORMAL | 1,834 | 1,200 | 3,034 | 1,200 / 1,200 |
| HARD 1回目 | 3,034 | 2,000 | 5,034 | 2,000 / 2,000 |
| HARD 同日2回目 | 5,034 | 2,000 | 7,034 | 2,000 / 2,000 |

各Patrolは8同時Claimのうち成功1件・23505拒否7件。追加retryでも残高・Item・EXP・Missionは不変。
他ユーザーClaim、未完了Claim、未解決Battle Claimを拒否。通常のEncounter生成・Replay作成・resolve-battleを実行し、勝利・敗北双方からのclaimを確認。
待機時間だけをfixtureで短縮。Vitality消費、EASY→NORMAL→HARDのunlock、通常EXP、Itemのresponse/保存/配送一致、Mission進捗の1回加算も検査した。
HARD初回CASHの台帳・プレゼントは0件。試験ユーザーは削除済み。

追加で実行した以下2件は変更前commitでも同じ失敗を再現した。今回のCASH変更に伴う回帰ではなく、旧期待値を持つ既存テストであり、本作業では他ドメインのテストを書き換えていない。

- `verify:mock-canonical-missions`: Mission数が47に対し旧期待値37。
- `verify:quest-gameplay-v2`: 廃止済み固定Encounter配列が0件に対し旧期待値21。

Supabase security advisorsも確認した。対象関数のSECURITY DEFINER公開権限に関する既存WARNはProductionと同一のACLに由来する。claimは認証・所有者検証付きのRPC、HARD関数は無作用のtrigger関数であり、今回ACLは変更していない。[Advisor説明](https://supabase.com/docs/guides/database/database-linter)

詳細な機械可読証跡は[quest_cash_hotfix_20260909.json](quest_cash_hotfix_20260909.json)。検証用接続情報はGit管理外とし、Production DBへの再適用・デプロイ・mainへのmergeは本作業に含まない。
