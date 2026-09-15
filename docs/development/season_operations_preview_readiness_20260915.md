# Season運営接続・Preview受入準備（2026-09-15）

## 今回の到達点

Preview `sufvuqdnqohpfzkwxohq` の実定義・実Masterを使うrollback検証がPASS。Productionへの接続・変更、実Season切替、恒久報酬付与、cron有効化は実行していない。

既存 `finalize_due_monthly_power_seasons_v1()` は登録済みPOWER／GUILD_POWERの期限切れを処理できる。新たなrunner関数は不要だった。今回、定時呼出しの登録候補と運用手順を用意し、既存runnerから両カテゴリの実付与処理へ到達することを検証した。

## 検証結果

`tests/db/monthly_power_runner_preview_rollback.sql` をPreviewで実行し全ROLLBACK。

- 対象なしは空配列で終了。
- fixtureのPOWERとGUILD_POWERを同一runner呼出しでCLOSEDまで処理。
- 先にPOWERが処理された後、GUILD_POWERの名誉報酬INSERTで故意に失敗。POWERを含むSnapshot・Item receipt・名誉receipt・状態更新の全rollbackを確認。
- 成功後の再実行で追加付与なし。
- 未登録Season、未来のPREPARING Seasonは変更なし。
- Present増加なし。anon／authenticatedにrunner実行権限なし。

実時計の月次境界、複数DBセッション同時実行、実機表示はこの検証の対象外。報酬の一部だけを恒久付与して受入データを作ってはいない。

## cron接続候補

`supabase/operations/20260915_monthly_power_runner_preview_candidate.sql`

- job名 `ranking-power-monthly-finalize-v1`
- 呼出し `select public.finalize_due_monthly_power_seasons_v1();`
- 候補周期5分。終了境界以降に再試行できるようにする。境界前には対象を選択しない。
- 登録直後からinactive。同名の別command、周期差分、active状態を黙って上書きしない。
- runner定義MD5とACLを検査。既定末尾ROLLBACK。
- Previewで登録・inactiveを確認し、ROLLBACK。永続jobは作っていない。

登録自体は新Seasonを作らない。既存PvP／Raid／Daily cronも変更しない。5分周期は終了処理の再試行間隔としての実装判断であり、追加のユーザー仕様承認を要しない。Previewへの恒久接続・有効化は親が既存Seasonへの影響を確認して管理する。Production有効化は別の公開承認後に行う。障害時は `cron.job_run_details` をjobidで参照し、原因解決後同じrunnerを再送する。失敗したSeasonを状態だけCLOSEDにしない。

Supabase公式Cron手順: https://supabase.com/docs/guides/cron/quickstart

## 正式OPENの実行順（今回は未実行）

確定済み: PvP／個人総合力／Guild総合力は正式OPENと同時開始。終了は2026-10-01 00:00 JST（2026-09-30 15:00 UTC）。旧9/16固定開始・PvP休止期間の案は使用しない。Guild Item資格は終了時の同Guild連続7日、加入日Day1、再加入前を合算しない。

1. 実公開時刻 `p_open_at`、操作停止時刻、準備Mission受取期限の起算時刻を確定。Production反映は別途承認が必要。
2. 操作停止を確認し、`20260915_formal_open_season_preflight_readonly.sql` 相当で状態・Master・既存auditを照合。実環境の参照はその環境の承認後に行う。
3. PREOPEN Guild Powerの現行期限（Previewでは2099年延長）を承認したcutoffへ変更し、既存 `finalize_preopen_guild_power_season_v2('guild_preopen_2026_rank_1')` を実行。1位Guild、全Guild順位／Member Snapshot、限定紋章receipt・通知、auditを照合。CLOSEDだけに変更する代用は禁止。
4. `close_gvg_preparation_missions_v1(progress_end, claim_anchor)` で進捗終了と30日Claimを設定。既存CLEAR／CLAIMED履歴を保持。引数は実確定値のみ。
5. `start_formal_open_seasons_v1(p_open_at)` を実行。既存旧PvP finalization→reconcile→CLOSEDと3カテゴリ開始を同一トランザクションで扱う。3カテゴリのstart一致、end一致、POWER登録2件を照合。同一時刻再送はALREADY_STARTED。
6. cron登録候補をレビューし、正式に確定した実行周期で登録・有効化。既存PVP／RAID／Daily job保持、対象job 1件を確認。
7. 画面で3カテゴリ期間、9Tier、Guild条件、本人順位・予定報酬・所持／装備表示を受入。公開Smokeと解除は親の統合手順に合流。

手順3〜5の途中失敗を扱うため、実行用SQLは実時刻と現行stateを取得した後にトランザクション化する。未確定時刻を埋め込んだ実行SQLや汎用Production実行スクリプトは作成していない。

## 実機確認時の注意

現在PreviewはPREOPEN Guild ACTIVE・月次登録0件。新Seasonを開始済みとして表示を期待しない。9TierなどのMaster表示は確認できるが、開始後の本人順位、7日在籍資格、受賞receipt表示は別の承認されたQA fixtureまたは切替後受入が必要。

fixture receiptを実ユーザーに配布しない。既存rollback試験の成功を、永続配信の実画面受入と混同しない。

## 最後に依頼する入力／残件

- 実正式OPEN日時と操作停止日時、準備Mission Claim起算日時。
- Previewで正式切替の実機確認を行う際の、切替許可・QA対象。現在実切替禁止のため保留。
- 月次jobの恒久登録・運用有効化。5分周期の接続コード・試験は準備済みで、親の統合工程。ユーザー判断待ちではない。
- 第2Season以後のPOWER／GUILD_POWER次Season生成は未接続。これは実装残件で、ユーザー未決とは断定しない。参照した確定資料では第1Season終端のみ明記され、既存 `start_formal_open_seasons_v1` は固定終端専用。毎月継続運用のAuthorityと照合して自動生成・Master継承を接続する。今回の終了runner・Preview実機確認を止める理由にはしない。
- Production公開判断は親で別途行う。

## 後処理のREAD ONLY確認

検証後: 月次runs 0、新規job 0、fixture関数なし。既存PvP `0 15 * * *`、Raid `0 15 * * 0`、Daily `0 15 * * *` のjob・command・activeを保持。新候補はPOWER／GUILD_POWER登録済みSeasonだけを扱い、PvPのadvanceを呼ばないため既存PvP cronと二重化しない。

## 親側の後続登録

2026-09-15、親が同候補のMD5/ACL/同名guardを実行し、Previewへ `ranking-power-monthly-finalize-v1` を恒久登録。schedule=`*/5 * * * *`、active=falseを確認。既定ROLLBACKの候補ファイル自体は維持する。実Season切替・報酬・cron有効化は行っていない。前述の「永続jobなし」は子担当の引渡し時点を示す。

## 次月接続の完了

月次継続Authorityを確認し、旧月終了→次月2カテゴリの同一transaction処理を追加。Preview実version20260915000930で定義適用済み。既存inactive jobを新advance関数へ接続。第2Season自動生成の実装残件は解消。詳細はmonthly_power_rollover_candidate_20260915.md。実時刻切替・cron有効化・実機確認は未実施。
