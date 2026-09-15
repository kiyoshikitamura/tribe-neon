# Mission期限・イベント履歴 修正候補

## 対象

監査M01（受取期限をサーバーで検証していない）、M05（終了イベントの受取済み履歴がイベント情報取得対象から外れる）。既存Previewの3関数定義を基準に最小差分を作成。

## 確定動作

- 個別受取：ユーザー単位ロックと同期後、付与前にイベントの`claim_deadline`を検証。現在時刻が期限以上なら23514で拒否し、処理全体を取り消す。
- 一括受取：付与直前に各件を再検証。期限切れを除外し、有効なCLEARだけを付与する。既存のトランザクション・重複防止・報酬方式は維持。
- `claim_deadline IS NULL`は無期限のまま。`progress_end_at`を受取期限へ流用しない。
- 達成済み・受取済みの状態や既存資産は削除しない。
- 有効イベントの取得対象へ、自分のCLAIMED履歴がある終了イベントを追加。期限切れCLEARも状態表示のため残す。
- `has_claimable_rewards`は有効MissionかつCLEARかつ期限内のみtrue。

## 変更と検証

Migration: `20260912153009_mission_claim_deadline_and_event_history.sql`

既存3関数のMD5（CR改行正規化）で適用直前のドリフトを検出する。CREATE OR REPLACEのみで既存権限を維持し、テーブルDDL・ユーザー資産更新・新しいRPC公開はない。

影響集計: `scripts/mission_claim_deadline_impact.sql`（READ ONLY）

実接続テスト: `tests/db/mission-claim-deadline.sql`。期限前・後・NULL、個別重複、一括混合・再送、期限切れのledger非作成、終了イベント履歴、2件目の故意エラーによる一括原子性を検証する。テストは実付与経路を呼ぶが、fixture・テスト用trigger・付与・台帳をすべてROLLBACKする。Preview専用で実行し、本番では実行しない。

SQL担当は作成のみ。Preview適用結果・DBテスト結果・配信結果は親の統合報告を正とする。
