# GAME03 本番反映前確認（2026-09-13）

状態: 本番反映準備中。Production配信・Migration適用は未実施。

## 受入基準

- 受入済みアプリSHA: `a70421643702e47a88366ef9eea952f435ef2990`
- Preview: https://tribe-neon-r71k5yd1v-kiyoshi-kitamura.vercel.app
- Deployment: `dpl_DegJywv75DF59Q1qsgyqTb7w5zqD`
- Preview DB: `sufvuqdnqohpfzkwxohq`
- Production DB: `ktpolnkyyfkowxdmijww`
- ユーザー実機PASS: Leader修正、Fresh Character報酬CTA、複数Mission一括受取、非先頭Leader表示、報酬受取待ち時間改善。再監査を要求しない。待ち時間の数値は未取得。
- 地元一致の実加算・Reload・再受取防止は既報PASSを継承。

## 今回の読取確認

Productionはsnapshot baseline方式。PreviewのMigration番号差をそのまま未適用リストにしない。

- 本番に `get_beginner_mission_journey`、`get_current_mission_reward_state`、`quest_town_key`、`quest_hometown_snapshot`、`on_leader_hometown_base` が存在しない。UIのみ配信不可。
- 本番のMission単体/一括受取、evaluate_mission_progress、sync_current_missionsは、改行正規化後のハッシュが `20260912073913_mission_owned_state_progress.sql` の事前ガードと全件一致。
- 同Migrationの「現在所持状態を下回る未受取CLEAR」影響件数は0。
- Guide recoveryの2関数は `20260912164928` の事前ハッシュと一致。
- social activity feedは `20260912164642` の事前ハッシュと一致。
- 装備Mission P002/P003、各機能入口P004/P006/P008/P010は本番で旧依存関係を保持。報酬値は既存条件と一致。
- 本番P010は GUILD_JOIN_COUNT、Normalランダムチケット1＋CASH300。報酬増量不要。
- `main` は `b722f6e6d60c89a58c4cdd9cb945ede0da265850`。受入SHAとdiverged（candidate側354、main側2コミット）。mainを現在Productionとみなさない。

## DB適用候補と依存順（未実行・最終確定前）

受入ソースに含まれる以下を本番定義・並行変更と照合して適用manifestを確定する。既存migrationを削除・ガード除去して通さない。履歴番号の異なるPreview適用済みファイルの重複適用は禁止。

1. `20260912064420_mission_content_entry_dependencies.sql`
2. `20260912073246_ranking_self_context.sql`
3. `20260912073913_mission_owned_state_progress.sql`
4. `20260912153009_mission_claim_deadline_and_event_history.sql`
5. `20260912153017_ranking_context_audit_fixes.sql`
6. `20260912164556_ranking_power_period_context.sql`
7. `20260912164642_hide_ssr_activity_preserve_history.sql`
8. `20260912164928_post_tutorial_guide_recovery.sql`
9. `20260912183652_beginner_mission_journey_authority.sql`
10. `20260912222025_beginner_tribe_participation.sql`
11. `20260913014208_beginner_post_tutorial_experience_order.sql`
12. `20260913032942_quest_hometown_reward_bonus.sql`
13. `20260913062244_mission_receipt_projection_and_leader_town.sql`

各段階の後続ガード、既存探索のsnapshot補完、権限、報酬ledgerの保持を含めて検証する。上記の順序は候補であり、本番適用許可ではない。無差別の `db push` は行わない。

## 配信担当への読取依頼

現在この環境ではVercel配信情報を取得する接続がない。次の情報が必要。

1. `tribe-neon.com` / `www.tribe-neon.com` の実alias先Deployment ID。
2. そのDeploymentの source SHA、target、READY、接続DB ref（秘密値は出力しない）。
3. Production実SHAと受入SHAの差分、Production側だけの変更一覧。上書きせず統合要否を判定。
4. 統合が必要なら独立作業フォルダで候補を作り、専用Previewで差分Acceptance。環境変数・共有alias・Productionはまだ変更しない。
5. 受入PreviewのRaid公開モード（`NEXT_PUBLIC_RAID_ROOM_UI_ENABLED`）と、開催中Raidの検証条件を確認。今回の画面は「現在開催中のレイドはありません」。Preview DBのlegacy設定もdisabled。開催中の実画面を用意する方法を確定し、公開設定を無断変更しない。

## 残る実画面確認

- 開催中Raidを未参加で退出しても開催待ち/達成に変わらない。
- 開催待ちから開催後の再提示。Guild以降を進めてもRaid未経験を保持する。
- 該当ロジックの `verify_raid_guide_availability.mjs` は今回PASS。実画面PASSへ読み替えない。
- Fresh QA「本番前QA9」をPreviewに作成。KPI `qa`、登録時点から無期限で除外。
- Fresh Tutorialの初級補完、探索開始、無料時短、探索完了はクラウドブラウザの実画面で確認済み。iPhone実機ではない。
- 同QAでTutorial Battle勝利・Result・Home復帰まで確認。Raidを開いた結果は未開催であり、開催中の退出/再提示は未検証のまま。

## 公開判定

配信準備・読取確認の依頼は可。本番反映依頼は、実Production SHAとの統合確認、Migration manifest確定、Raid実画面確認が完了してから。
Production、共有alias、環境変数の変更は今回なし。
