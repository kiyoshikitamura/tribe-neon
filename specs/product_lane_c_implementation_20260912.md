# Product Lane C 実装報告（2026-09-12）

## 状態
コード候補作成・型検証済み。専用Preview配信／実接続受入／実機デザイン監査は未実施。Production変更なし。

## Ranking
- 既存3カテゴリ×2期間、公開編成5体、プロフィール・Guild詳細、報酬ダイアログを維持。
- 順位基準・取得完了時刻、直上との差、上位／自分周辺切替、カテゴリ固有CTAを追加。
- 取得失敗・順位未成立・未所属を区別し、未取得スコアを0にしない。
- 日次Battleの指標は勝利数。報酬帯は現在順位／次の報酬帯を強調し、確定前を明示。
- 公開プロフィールは上位100件＋自己／近傍に対応し、100件以下へ分割して取得する。

## Navigation
- Gacha→Character→Quest→Battle→Raid→Missionを維持。
- Raid全件一覧の正常取得と有効な状態値の確認後のみ未開催と判定。エラー・未取得はunknown。
- 未開催は開催待ちを表示しMissionへ。既存acknowledge_initial_raid_guide()後にcomplete_activation_mission_handoff()を呼ぶ。
- first_raidはクライアントで書かない。案内完了後も開催時にRaid導線を再表示。
- ページ再入場・タブ復帰時に一覧を再確認。開催待ち表示を維持する。
- 親エージェントのPreview READ ONLY確認で、既存RPCはfirst_raidまたはinitial_raid_unavailable_ackを受理することが判明。ローカル旧SQLと差異があるため、不要なhandoff置換候補を撤回。

## DB候補／残条件
- specs/sql/ranking_self_context_candidate.sql は未適用の追加読取候補。POWER/GUILDは154、PVPは228の順位・対象条件を維持し、認証本人の順位と前後各2件を返す。親のPreview READ ONLY確認でも元の3順位定義は一致。
- 新RPC get_ranking_self_context 未適用環境では追加情報取得失敗を明示。上位外自己順位・周辺順位の実接続PASSとはしない。
- プレオープンGuildは既存RPCのselfRankとページングを使用。
- POWER一般シーズン／通常Guildシーズンは日付metadataの正本読取契約がなく、日時を推測しない。期間取得契約の補完は残件。
- Previewのacknowledge_initial_raid_guideはlegacy開催チェックのみ。今回クライアントはRoom全件確認後にだけackを呼ぶ。Room確認のサーバー側統一は別途差分確認対象。

## 検証
- npx tsc --noEmit --pretty false: PASS。
- verify_game03_daily_cta_activity.mjs: PASS（未開催Mission、案内後のRaid再登場、参加実績非付与を追加）。
- verify_ranking_profile_batches.mjs: PASS（105件・重複・失敗伝播・公開編成5体）。
- verify_preopen_guild_power_ui.mjs: PASS。
- verify_ranking_reward_regression.mjs: 旧Raid週次報酬2件の期待に対し現行は0件でFAIL。該当報酬domainは今回未変更。今回のRanking変更とは別管理。
- SQL候補の適用・実行検証は未実施。

## 正本監査
- Customer Journey: 初期ユーザーも所属前から個人の目標・行動を確認できる。初回案内がカテゴリ固有CTAを置換しない。
- Game Cycle: 現在地→直上の目標→育成／Battle／Guildへ接続。
- Motivation Cycle: 公開編成・他者の存在を保ち、実績・比較・次行動を示す。順位上昇や未確定報酬を保証しない。
- デザインはユーザーの全ページ一括実機監査後に調整する。
