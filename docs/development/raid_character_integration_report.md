# Raid / Character 固定候補のローカル統合

## 対象と採用方針

- Raid: `9fe5909c024f649c47ec8402409936cd79fd1a37`
- Character: `a02754c98c1d927e36ecdb46d7ac55541828a346`
- 共通祖先: `afb0ca4fd3d2bec5216fa98e5e2ff3a12dec3e90`
- 専用branch: `codex/raid-character-integration-20260909`
- この報告を含む最終merge commitが統合候補。完全SHAは最終チャットと `git rev-parse HEAD`。この組合せは最新本番同期済みを意味しない。

固定Character SHAだけをローカルcloneから読み込み、Raidを起点に3-way merge。Characterの後続commitや別系統の修正は採用していない。Character Home、選択状態、Setup SKIPとタイマー保護、Gacha Presentationとcategory・素材依存を採用。既存Raid第1〜3工程、日次2エリア、集約/詳細API、参加/救援資格、Replay/ack帰還、報酬/Present、Characterの育成/編成/計算処理を保持した。

## 共通ファイル・競合解消

- `GameContext.tsx`: ガチャcategoryの取得・設定・公開3hunkを追加。Raid return target、userId/roomId、救援target解除、refresh revisionは保持。
- `OutlawButton.tsx`: Raid側のnullish fallbackを維持。`loadingLabel=""`は文字なし、未指定は既存「処理中…」、明示ラベルはその値。3ケースを実部品で検証。認証ユーザー切替時の詳細応答破棄も追加検証。
- `CommonModals.tsx`: CharacterGachaPresentation導入を採用し、既存PublicUserProfile/Present経路を維持。
- 台詞2ファイルは双方同一内容を保持。
- フォントREADMEのadd/add競合は空行の空白4箇所だけ。Character側の空白整理を採用し、帰属/ライセンス本文と実woff2を保持。

## 統合検証の補完

既存Mockは `list_raid_room_battle_recoveries_v1` を未実装で、Raid UIを有効にした新規起動でエラーになる。`mockRpc.ts` に、テストが明示した `mock_rpc_fixture:empty_raid_recoveries=true` の場合だけ新規ユーザーの空履歴を返すfixtureを追加。未指定時の動作、実Supabase RPC、ack処理、戦闘履歴は変更しない。Fresh Journeyはこの補完に加え、空だったMockのガチャ・クエストマスターを現行canonical JSONから初期ロードする。成功結果やユーザー進行の強制はしない。実HTTP復帰のPASSとは区別する。ゲーム進行やマスターを強制してFresh完了にしない。

Setupの通常文字送りで検出したrender中の親state更新警告を、共通TypewriterTextの完了callbackをstate updater外へ移して修正した。文字速度と完了タイミングを維持し、一度だけ親へ通知することを検証。別系統の後続コードは使用していない。

## 検証記録

検証結果は同候補上の再実行結果を各担当報告へ記録する。採用元の証跡は履歴としてのみ保持し、この統合候補の証拠と混同しない。

- [A: Character](raid_character_a_report.md)
- [B: Setup / Gacha](raid_character_b_report.md)
- [C: Raid / Fresh Journey](raid_character_c_report.md)
- 共通証跡: `evidence/raid-character-integration-20260909/` および `evidence/raid-character-integration/`。
- 隔離PGで日次/集約10群、詳細表示4群を再実行。周辺fixtureを使うPG検証であり、PostgREST/GoTrueの実HTTP認証ではない。

## 引継ぎと未完了範囲

- Preview接続、実HTTP認証/認証切替、実端末Safari、人による最終ビジュアル受入は別工程。
- 第3工程の報酬スクロール・参加者プロフィール往復はローカル修正/機械検証済み。実端末受入は未完了。敵選択・敵情報・全体一覧・救援・Resultの残りの承認済み改修を継続する。
- Character採用Setupの追加計測は `record_kpi_acquisition_landing_v1` と `WORLD_INTRO_VIEWED/SKIPPED` の対応が固定SQL内で不足。表示進行を妨げないが、計測の実接続完了とは扱わない。既存KPIとの統合・HTTP検証を後続へ引き継ぐ。
- Preview適用待ちSQLは `20260908175140_raid_top_daily_authority.sql` → `20260908175143_raid_top_aggregate_api.sql` → `20260908181251_raid_room_display_projection.sql`。今回はSQL追加・変更なし。適用前に既存250〜263など依存と実履歴を照合する。
- Preview配信前には、その時点の本番SHA・並走成果との共通祖先/差分/競合を改めて確認する。今回の固定候補から本番の現状を推測しない。

push、Deploy、外部DB適用、Edge/Cron/運用フラグ/共有alias変更は行わない。ローカルMock用設定は外部運用設定とは別。

## 今回の結果

- C: 236件PASS（Raid227、Character8、Fresh1）。Freshは新規開始→無料10連→Lv7育成→編成→派遣/時短→現Street戦闘→Result→案内→Mockメール登録→Home→Character HOMEまで通常操作で完走。画像失敗/pageerrorなし。実HTTP認証は未検証。
- B: Setup/Gacha17件PASS。Typewriter修正後にSetup6件を再実行PASS。SSR台詞検証・60人7エリア背景検証PASS。
- A: 育成/覚醒/skill/装備/導線の関連script PASS、独立9群PASS。post-loadout browserは1PASS/1FAIL。失敗は旧raid_bossesだけのfixtureが新Room活動投影を満たさないため。期待を緩めてPASSにせず残件として保持。
- 親: 共有UI/詳細認証切替/Typewriter5件PASS、隔離PG14群PASS。Mock production build・最終型検証PASS。全体lintは0 errors / 1855 warnings、最終共有変更のlintも0 errors。警告ゼロとは扱わない。
- 375/390/430pxおよび390×600等で画面撮影。親/A/B/Cが担当画像を目視。機械検証とエージェント目視は人の実端末・最終ビジュアル受入ではない。

今回追加修正は、固定候補の合成に必要な空ラベルの保持、Setup Typewriter完了通知、明示Mock復帰fixture、および検証script/fixtureの追随。後続別系統のコードは採用していない。
