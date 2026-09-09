# Raid公開連動告知：実装前監査

> 2026-09-10更新: ユーザー指示でバナーをオミット。以下は初回監査の履歴。
> 最新実装・検証・公開手順は `scripts/raid-announcement/README.md` を正とする。
> 指定スレッドから統合候補 `8c0fa6b2131faaed7b63e172ac12424d3fe8f6be` を特定し、独立ブランチで告知差分を実装済み。本番公開/送信はRaid公開後。

監査日: 2026-09-10 JST。公開・DB変更・チャット送信・アプリ変更は未実施。

## Repository / Production候補

- Repository: https://github.com/kiyoshikitamura/tribe-neon
- 作業フォルダが空だったためmainを取得。main HEAD: `b722f6e6d60c89a58c4cdd9cb945ede0da265850`。
- `codex/emergency-production-recovery-20260909` (`fca0afc`) と `codex/character-production-sync-20260909` (`0ef8a56`) と `codex/raid-room-rescue-20260908` (`375a0ad`) は別の候補。
- recovery系統にはガチャ・バトル演出、Battle TOP、MyPage Activityの実装を確認。character系統にはSTEP 2改修、raid系統にはRoom/rescue実装を確認。
- これら全てを含む公開対象SHA、Acceptance結果、現行Productionとの一致は未確認。mainからのデプロイで直近改修が保持されるとは判断できない。
- ユーザーへ公開対象ブランチ/SHA・公開先URLを照会中。指定前に候補の統合や公開は行わない。

## 1. Announcement

- `src/app/context/GameContext.tsx`: `news` を取得し `created_at DESC`、`start_at` を表示日へ変換。
- `src/app/components/InboxPanel.tsx`: 一覧タップで `CanonicalDialog` に本文を表示。
- `InboxPanel.css`: `white-space: pre-wrap; overflow-wrap: anywhere`。指定本文はプレーンテキストで保持可能。
- `setup_schema.sql` に旧 `news` 定義があるが、`supabase/migrations` に対応する作成処理は見つからない。
- 本番 `tribe-neon-prod` (`ktpolnkyyfkowxdmijww`) を読み取り監査し、public.news が存在しないことを確認。Published状態や運営CMSは確認できない。
- DB分類: **REQUIRES_MIGRATION**。既存UIの取得契約を満たす不足テーブルの復旧と公開/非公開制御が必要。旧setup全体の適用は禁止し、対象だけの差分を用意する。

## 2. System Message

- 既存Authority: `public.board_posts` の `is_system`。`target_type='GLOBAL'`、`user_id/author_id=NULL` を使用可能。
- `send_chat_message` はUser投稿用で `is_system=false` のため今回の送信には使用しない。
- 本番KPIトリガー `on_kpi_v249_guild_chat_message` はGLOBAL、ユーザーIDなし、Systemを除外。他のguild活動トリガーも対象外となる条件を確認。
- 本番board_postsには汎用event key列なし。固定メッセージUUIDと既存PKの競合防止を使う方式が候補。再実行で本文・送信時刻を更新しない。
- お知らせ公開と一件送信をトランザクションにまとめる。公開前やDeploy時の自動送信は行わない。
- 送信済み確認は固定UUIDによるSELECTで行う。Systemフラグ・本文・対象・ユーザーIDなし・件数を検証する。

## 3. MyPage banner

- mainはProduction Creative 3枚固定。DB取得をスキップ。
- recovery/character系統は通常4枚（クエスト→バトル→ランキング→コミュニティ）。キャンペーン中は専用2枚へ切替。
- 4秒自動Rotation、左右矢印、dotsあり。監査対象HomeTabにswipeハンドラなし。カードと矢印は別button。
- 素材定義は1200×200（6:1）。表示は幅可変、既存CSSで高さ54px、object-fit:cover。Mobile/PCの実描画は未検証。
- 本番home_banner_masterには旧4行が残るため、全行をそのまま現行UIへ取り込むと既存表示を壊す。
- 方針: 新規 `raid_battle_major_update` 行だけを追加枠として取得し、現行配列の末尾へ追加。既存キャンペーン制御・telemetry・順序は維持。
- 既存 `active/start_at/end_at/image_url` を運営Authorityに使用。終了日時はNULL。素材未提供時はactive=false、画像生成や仮画像追加なし。
- 予定配置先: `public/promotion/raid_battle_major_update.webp`。参照: `/promotion/raid_battle_major_update.webp`。提供素材の形式が異なる場合は拡張子と参照を一致させる。
- 新規素材のロード失敗が既存全バナーの表示を止めないよう、追加分だけを非表示にする。画像差し替えも反映できるよう、IDだけで更新判定しない。

## 4. Raid navigation

- 既存Authorityは `navigateTab('raid')`。`src/app/page.tsx` が `activeTab === 'raid'` で `RaidTab` を表示。
- 新規URL routeは不要。既存機能公開状態とRaid開催状態による表示条件を公開候補上で確認する。
- タップ→Raid→戻る、Activity、KPI、既存バナー、Mobile Safari相当/PCのAcceptanceは未実施。

## 次の作業

1. 公開候補SHA・公開先・Raid公開時刻の確認。
2. 候補上で不足news migration、冪等な公開処理、追加バナー取得だけを最小差分実装。
3. Previewで公開/非公開、本文一致、System一件と再実行、KPI対象外、バナー切替/ロード失敗、導線を検証。
4. 正式バナー素材の配置と表示検証。未提供なら非表示のまま、Raid本体公開を阻害しない。
5. Repositoryの接続先検証手順を満たし、Raid公開確認後に本番反映・読戻し検証。

現時点でDONE CONDITIONは未達。公開状態やRegression PASSを推測で報告しない。
