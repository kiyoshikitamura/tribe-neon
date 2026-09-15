# RAID-C-05 SQL検証記録

2026-09-08。STATUS: IMPLEMENTED（親レビュー前）。PGlite 0.5.8 / PostgreSQL 18.3 WASM の一時DBで **19件 PASS、0件 FAIL**。

## 対象と再現手順

`20260908000250_raid_room_read_projection.sql`、`20260908000251_raid_room_condition_rules.sql`、`20260908000252_raid_room_lifecycle.sql` を順に無改変適用。00250の既存最小fixtureを読み込み、追加fixtureで `spawned_at`、service_role / PUBLIC継承probe、30ユーザーを追加。実DBのschema全体・Authサービスを再現するものではない。

00252検証時 SHA-256: `8e1d91f1255c52f3cc0fd60be743c7983b1bcab3b0ece497869afb2da87470f9`。

```bash
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-lifecycle-run.mjs
```

runnerはPGlite導入済みディレクトリのみを受け取り、外部DB接続URLや資格情報を受け取らない。テスト内の変更値・ユーザーは一時fixtureだけの入力であり、ゲーム仕様の確定値を追加していない。

## 結果

|検証|結果|
|---|---|
|4難度seed 10 / 10 / 10 / 5、20人、24時間|PASS|
|未使用Instance登録、24時間保持、ownerが既存参照RPCに1人表示、参加資格はunknown維持|PASS|
|24時間以外・未来開始・期限切れ・終了status・HP不正・時刻NULLの登録拒否|PASS|
|既存progress行（0戦含む）またはDamageログのあるInstanceの転用拒否|PASS|
|登録再送は終了後も同じID、owner / 難度変更拒否|PASS|
|各難度の上限一致まで成功、次の登録拒否、難度間を独立集計|PASS|
|CLEARED / EXPIRED / ACTIVE期限超過 / HP0を開催枠から除外|PASS|
|owner含め20人まで参加成功、21人目拒否、満員時再送成功|PASS|
|owner / member / finalized progressをUNION集計、重複は一人|PASS|
|未確定progressは枠を消費せず、加入後は一人|PASS|
|終了後新規参加拒否、既参加再送で台帳不変|PASS|
|NULL / 不明ID / 難度 / 不存在user拒否、失敗で孤立Roomなし|PASS|
|anon / authenticated / service_role / PUBLIC継承probeの権限確認と実呼出拒否|PASS|
|設定tableのdefault deny / RLS、関数invoker / search_path確認|PASS|
|REPEATABLE READ / SERIALIZABLEで両更新関数を拒否|PASS|
|親transaction rollbackでRoom・参加書込を一括取消|PASS|
|一時的な設定変更が上限・定員・期限に反映、設定欠落は拒否|PASS|
|transaction開始時刻より未来でも実時計で過ぎた期限は参加拒否|PASS|
|Migration再適用で変更済み設定を保持|PASS|

確定progressのみ存在する参加者をmembersへ追加する初回結果は `joined`、その後の再送は `already_joined`。人数はどちらも増えない。最初の検証では初回を `already_joined` と期待して1件FAILしたが、台帳追加の契約に合わせ期待値を修正し、19件すべて再実行してPASS。

## 確認範囲と未完了

- 同じPGliteセッションでSQLを逐次実行した結果。多接続で最後の1枠を競う実行、row lock待機後のsnapshot可視性、deadlock、戦闘確定との競合は未検証。単なるPromise並列を多接続競合PASSとして数えていない。
- READ COMMITTED以外の拒否は実行検証済み。ただしロック設計が実PostgreSQL多接続で意図どおり動くことは別途確認が必要。
- 公開生成・参加RPC、本人認証・総合力・費用・生成資格・救援経由・報酬接続を確認したものではない。非公開内部関数へのowner相当呼出で台帳更新を確認した。
- Production / Preview DB、PostgREST、JWT、実環境default privileges / role継承、既存戦闘全経路、実機確認は未実施。外部DB変更・Deploy・git操作は行っていない。
