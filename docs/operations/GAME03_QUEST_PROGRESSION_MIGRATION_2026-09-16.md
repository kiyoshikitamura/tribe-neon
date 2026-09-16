# クエスト進捗型への移行手順

## 範囲

Migration適用は関数・保存先の準備のみ。利用者の進捗は変更しない。
`quest_progression_user_versions.progression_version = '2026-09-16'` の利用者だけ新進行を有効にする。
PreviewはQA利用者を明示指定して検証。本番の実行はPreview受入と補填確定後の別工程。

## 呼出契約

`migrate_quest_progression_v1(p_user_ids uuid[], p_migration_key text, p_cutoff_at timestamptz, p_compensation jsonb, p_compensation_scope text)`

- service_role / DB運用者のみ実行可能。クライアントに公開しない。
- 対象UUID配列は明示必須、1～1000名。全件指定の省略動作はない。
- migration_keyは再実行でも同じ値。cutoffと補填内容・scopeも保持する。
- cutoffより後に開始した稼働探索がある場合は全体を中止する。移行開始時刻と対象の確定後に実行する。
- 補填例の形式：`[{"item_id":"ENERGY_DRINK","quantity":2}]`。これは形式例であり採用数量ではない。
- scopeは`ALL_TARGETS`（対象全員）または`ACTIVE_PATROLS`（退役対象探索あり）。
- 補填未設定nullは拒否。QAで無補填を試すときだけ明示`[]`。本番では運営確定内容を渡す。

## アトミックな処理

1. users行をロックし、同じ利用者の探索開始との競合を防ぐ。
2. 旧クリア履歴と旧探索を専用監査表に保存。
3. 既に満了し、戦闘なしまたは勝利確定済みの未精算探索の報酬だけプレゼントBOXへ移送。
4. CASHは探索開始時snapshot＋地元ボーナス、XPと抽選アイテムは適用時に保管した旧Masterを使用。旧claim同様、抽選は1回。初回追加報酬を独自に増やさない。
5. 稼働探索をMIGRATEDへ退役。旧patrolは削除せず、レイド遭遇の外部キーを維持。
6. user_quest_first_clearsをリセット。旧クリア履歴は監査表で保持。
7. 補填をBOXへ入れ、新進行versionを登録して完了。

COMPLETED探索は既に付与済みなので再配布しない。未満了・未撃破・敗北探索の将来報酬は作らない。
ユーザーLv・所持資産・既存ミッション達成/受取履歴・参加レイドを変更しない。
処理失敗時は全体rollback。完了後の同一入力再送は保存結果のみ返し、再リセット/再抽選/再配布をしない。

## プレイヤー経験値のBOX受取

PLAYER_XPは`QUEST_PROGRESSION_LEGACY`由来のプレゼントのみ`apply_user_xp`で付与。
既存の単体/一括受取の所有者確認、期限、行ロック、受取済み記録を維持する。
一般アイテムの付与関数は変更しない。受取後にLv・XP・APも再読込する。

## 検証

- ローカルfixture：`QUEST_PGLITE_MODULE=<PGliteのローカル絶対パス> node scripts/verify_quest_progression_migration.mjs`
- PGliteは検証用任意依存で、アプリ依存には追加しない。
- fixtureは満了勝利/未満了/敗北/受取済みの区別、旧資産/ミッション/レイド保持、XP受取、再送、失敗rollback、RPC権限を確認。
- Previewでは実schemaで同じ条件を確認し、QA以外のuser version件数が増えていないことを確認する。
- 新進行側のstart/claim/battleがMIGRATEDを拒否することは統合検証で確認する。
