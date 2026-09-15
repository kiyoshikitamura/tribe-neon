# World Introduction SKIP

登録前のSetupViewから既存NAME_INPUTへ移動する。名前登録後のWORLD_INTROを含むTutorial、Game Start、Identity、課金・報酬のAuthorityは変更しない。

## DB contract

Migration `20260907000251` は `kpi_acquisition_journey_facts.event_type` のCHECKと `record_kpi_acquisition_observation_v1` の許可集合に `WORLD_INTRO_VIEWED` / `WORLD_INTRO_SKIPPED` を追加する。旧5イベントを保持し、RPC signature、metadata、RLS、ACL、既存UNIQUE、インデックスは変更しない。`client_funnel_events` は変更しない。

既存tokenを利用し、idempotency keyは `world_intro_viewed:v1` / `world_intro_skipped:v1`。一時的な通信失敗は最大3回再送し、未送信分はsessionStorageに残してreload時も再送する。UIは送信完了を待たない。ブラウザ終了やstorage消去前に一度も送信できなかったイベントの配信は保証できない。

## Verification

Previewで `BEGIN → migration本体（COMMIT除外）→ scripts/verify_world_intro_journey_contract.sql → ROLLBACK` を実行する。仮適用前後でwriter定義、制約、RLS・ACLの一致を確認してから永続適用する。transaction内fixtureは正規の名前登録RPCでsubjectを作成し、終了時に全てrollbackされる。

## KPI

`scripts/report_world_intro_funnel.sql` はsource / campaign / creative別のLanding cohort集計。登録前離脱のjourneyも分母へ残す。Game Startの分子は既存canonical subjectのdistinct件数で、journey bindingをLEFT JOINする。既存Dashboardを変更せず、同じAuthorityから集計できる。cohortの計測時点によって未登録Journeyは後日登録される可能性がある。

## Rollback

リリース後はアプリを直前のProduction deploymentへ戻し、追加の許可集合と既に記録したfactsは保持する。既存アプリは追加イベントに依存せず、データ削除は不要。新イベントが保存されたDBでCHECKを旧5イベントへ狭めるrollbackは行わない。リリース前のtransaction rollbackでは元定義へ完全に復元できる。
