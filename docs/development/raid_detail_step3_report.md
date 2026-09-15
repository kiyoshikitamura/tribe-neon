# レイドUI 第3工程 統合報告

基準SHA: `4e50a455947d837df66b4ecc64f755a13b8f83ff`。専用ローカルbranch: `codex/raid-detail-step3-20260909`。この報告を含むcommitが実装commit（完全SHAは最終チャット報告 / `git rev-parse HEAD`）。基準から分岐し、後続の別作業差分は取り込んでいない。

## 実装

- A: 敵、主催者、戦況、敵情報/参加者/報酬入口、本人貢献、既存出撃準備の順へ整理。4役、開催/撃破/期限終了/未取得/失敗を区別。既存素材と共通UIを使用。
- B: 参加者の行全体から既存プロフィールへ切替。戻った際の一覧位置を復元。報酬本文をスクロールし、ヘッダーと下部の閉じる操作を固定。safe areaとフッターを回避。予定報酬と発行済みPresentを分離し、既存プレゼントBOXへ接続。
- C: 実部品と実RaidRoomBrowserを使うMock画面、390×844/390×600、長い名前/多数参加者/多数報酬/取得失敗/画像フォールバック、プロフィール往復、閉じる44px、Present入口を検証・撮影。
- 親: 表示契約、既存Browser/ConnectedBrowser/RaidTab接続、補完read RPC、隔離DB検証、統合画像レビュー。戦闘/参加/報酬資格・バランス・24時間期限・日次処理は保持。

## 変更ファイル

- `src/app/components/raid/RaidRoomDetail.tsx/.css`, `RaidRoomDialogs.tsx/.css`, `RaidRewardItems.tsx/.css`: 表示部品。
- `RaidRoomBrowser.tsx/.css`, `RaidRoomConnectedBrowser.tsx`, `RaidRoomClearRewardPanel.tsx`, `RaidRoomRescueRewardPanel.tsx`, `src/app/components/RaidTab.tsx`: 既存導線との統合。
- `src/domain/raidRoomDisplay.ts`, `raidRoomDisplayClient.ts`, `src/app/components/raid/useRaidRoomDisplay.ts`: 型、検証parser、認証/選択切替時の古い応答破棄。
- `supabase/migrations/20260908181251_raid_room_display_projection.sql`: 今回の追加SQL 1本。
- `src/app/qa/raid-detail/`, `scripts/raid-detail/`, `tests/raid-room/detail-*`: Mock・撮影・DB/UI試験。既存browser/clear-reward試験とrunnerを表示変更に追従。
- 本報告、契約、担当票、検証報告、evidence。outputs・DB・依存物はcommit対象外。

## 実データ接続範囲

既存room/briefing/participants/clear reward/rescue rewardと既存参加・準備・プロフィール・Present callbackを再利用。追加 `get_raid_room_display_v1` は選択中レイド1件について主催者Guild、最大20参加者＋主催者のleader ID、本人role、現行マスターの討伐/救援報酬予定をまとめて取得する。未参加者には主催者のleaderだけを返す。予定データにPresent IDや受取状態を持たせない。発行済み状態は既存報酬APIを正本とする。

ローカルでは実SQL→返却JSON→実parserまで検証。ブラウザー操作/画像はMockデータ。Supabase HTTP認証を通した一連の接続、Preview接続、実端末は未検証。ローカル実装・機械検証済みであり、Preview接続完了ではない。

## 検証

- 型検証PASS、Mock build PASS（`NEXT_PUBLIC_USE_MOCK_DB=true`）。初回buildはMock環境変数名の不足で停止し、正しい設定で再実行PASS。
- UI/domain関連: Cの205件（新規16＋既存189）、既存トップ16件、第2工程接続6件＝227件PASS。
- 隔離PostgreSQL17: 今回の表示SQL4群PASS。実SQLでowner/member/rescue/outsider、Guild、予定とPresentの分離、認証/直接表権限、書込みなしを確認。第2工程の同時要求/JST境界/日跨ぎ再送/救援公開範囲など10群も再実行PASS。
- Supabase security advisors: 新規オブジェクトの指摘なし。周辺テストfixture関数2件の既知search_path WARNあり。完全なSupabase環境の監査ではない。
- 390px幅の画像を親/Cが目視。人による実端末操作と最終ビジュアル受入は待ち。

詳細: [画面検証記録](raid_detail_step3_validation.md)。画像: [戦況詳細](evidence/raid-detail-step3-20260909/integrated-member-844-top.png)、[参加者往復](evidence/raid-detail-step3-20260909/integrated-participants-restored-600.png)、[報酬末尾](evidence/raid-detail-step3-20260909/integrated-reward-600-bottom.png)。

## Previewへの次工程（今回は未実施）

1. 対象環境の既存250〜263等の適用履歴を確認。とくに討伐報酬262と既存参加者/救援APIが前提。
2. 第2工程の保留2本 `20260908175140_raid_top_daily_authority.sql` → `20260908175143_raid_top_aggregate_api.sql` の順。
3. 今回の `20260908181251_raid_room_display_projection.sql` を続ける。既存マスター値・運用フラグを変更しない。
4. RPC権限/認証切替/公開範囲/予定対PresentをHTTP経由で検証し、対応するフロントを反映・実端末受入。適用や反映は別途の承認範囲で行う。

残件: 第2工程HTTP認証検証とPreview適用、実端末Safari safe area/プロフィール内Guild・DM往復/Present受取/実戦闘帰還の受入。敵選択・敵情報・全体一覧・救援・Resultの残りの承認済み改修。報酬スクロールと参加者プロフィール遷移は今回ローカルで修正・検証済み、実端末受入待ち。

push、Deploy、Preview/本番DB適用、Edge/Cron/運用フラグ/共有alias変更、追加ZIPは行っていない。
