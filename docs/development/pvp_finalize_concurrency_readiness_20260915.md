# PvP 初回 finalize 同時競合試験（2026-09-15）

## 状態

**実DB同時競合試験は未実施。PASSとは扱わない。**

Preview `sufvuqdnqohpfzkwxohq` の現行関数・列定義を read-only で照合した。環境変数にDB接続情報がなく、実 `.env`、`.pgpass`、Supabaseリンク先pooler情報もない。Python `psycopg` / Node `pg` も未導入。MCPの並列送信が以前Postgres上で直列実行されたため、同じ方法を再試行して競合PASSとすることはしない。

今回追加した `tests/db/pvp_finalize_concurrent_preview.py` は構文検査と、接続未設定時にDBを変更せず `NOT_PASS` で終了することのみ確認済み。実接続、fixture生成・削除、競合、assertion全体の実行はまだ確認していない。

## 試験方法

- Previewの直接Postgres、またはsession poolerの5432番を使い、独立した3接続を作る。対象project refとTLSを固定。Production接続、transaction pooler、URL queryによる接続先上書きは禁止する。
- 通常ユーザーとは異なる専用QAユーザー2名とPENDING replayを作る。既存の正式battle結果・snapshotは読み取りfixtureとして利用する。実戦engine・消費処理の試験ではない。
- AがPENDING replayを行ロック。Bが初回finalizeを呼び、そのロックで待機することをobserverが `pg_blocking_pids(B)` にAが含まれる事実で検出する。
- その待機を観測できてからAでfinalizeしCOMMIT。Bが保存済みreceiptを返してCOMMITする。
- receipt一致、CASH200、Raid Ticket1、claim1、勝数各1、RATE1回分、防衛log1、追加BP消費なしを確認する。
- 成否にかかわらず専用QAと既知の関連データを削除する。publicのUUID列に対象3UUIDが残っていないか検査し、未知の残存は勝手に削除せず失敗とする。
- Seasonの自動遷移を起こさないよう、有効なPVP Seasonと終了余裕を検査する。期限切れの環境では試験のためにSeasonを変更しない。

ロック待機確認はPostgreSQL公式の [pg_blocking_pids](https://www.postgresql.org/docs/current/functions-info.html) に基づく。単に同時にHTTP送信した事実を成功根拠にしない。

## 実行環境側の準備

DB管理権限のある既存作業環境で、`psycopg` v3とその接続に必要な信頼済みCAを準備する。接続文字列はチャットへ貼らず、`PVP_PREVIEW_DATABASE_URL` に環境側で設定する。証明書検証は `verify-full` 固定で、必要なCAは `PGSSLROOTCERT` 等の正規設定を使う。

```bash
python tests/db/pvp_finalize_concurrent_preview.py
```

成功時のみ、`blocked_by_owner_at`、別々のPID、資産・ranking件数、`cleanup: PASS`、`status: PASS` を出力する。資格情報や接続文字列は出力しない。

開始時に出力される `fixture` は `[QA_USER, QA_OPPONENT, QA_REPLAY]` の順。プロセス強制終了や接続断でcleanupが完了できなかった場合は、その3UUIDで同じスクリプトのcleanupのみを再実行できる。

```bash
python tests/db/pvp_finalize_concurrent_preview.py --cleanup QA_USER QA_OPPONENT QA_REPLAY
```

このcleanupはQAのbio／replayのmarkerが一致することを確認し、通常ユーザーを対象にしない。fixtureの短時間COMMITがあるため、完全な単一transaction rollback試験ではない。PreviewのQA利用時間帯に実施する。

## 親スレッドに残す依頼

独立したPostgres接続を許可済みの環境へPreview DB資格情報を設定すること。今回の作業では新たな資格情報の発行、権限変更、公開APIへの一時関数追加、Productionアクセスを行っていない。
