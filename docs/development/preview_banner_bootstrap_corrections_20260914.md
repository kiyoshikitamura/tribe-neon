# Preview バナー・起動時エラー修正（2026-09-14）

基準SHA: ad9cc8cf0271cb0755b2182c0f2eaf4fbdf795b9。
ユーザー実機確認: 前回のQuest表示・難度順・PvP開始はOK。追加NGはMyPageのRaidローテーションバナー消失、および起動時406/404。

## Raidバナー

PreviewとProductionのhome_banner_master対象行はともに、raid_battle_major_update → /promotion/mypage_banner_raid_update_1200x200.jpg → raid、active=true。
Repositoryには旧1160×480 WebPだけ存在し、指定1200×200 JPGが欠落。HomeTabは画像decode失敗時に該当バナーを除外するため消失した。前回の依存素材照合漏れ。

既存受入済みRaidバナーの復旧依頼に基づき、Production実配信の指定ファイルをREAD ONLYで取得。画像内容「レイドバトル大幅アップデート／協力してボスを撃破せよ」、1200×200 JPEGを目視確認し、無加工で同じpublicパスに継承する。

- 取得元: https://www.tribe-neon.com/promotion/mypage_banner_raid_update_1200x200.jpg
- HTTP 200、image/jpeg、123749 bytes
- SHA256: 43269a867ce649bb3a87d99b30ca1ac55d1a11d88ae81e0a0f0d8fb3d2da112c
- DB行、公開期間、表示順、Raid遷移、他バナーは変更しない。
- 今回継承するProduction差分はこの画像1点。その他の未確認差分は統合しない。

Production: NOT EXECUTED。Preview DB変更なし。

## 起動時の406/404

- guild_members / story_sessions: 報告ユーザーはいずれも0件。1件必須のsingleを0件許容のmaybeSingleへ修正。実際の取得エラーは引き続き報告し、データ補填は行わない。
- battle_sessions: Previewには存在せず、旧Client snapshot互換経路。明示的Mock利用時のみ参照・保存する。正式なQuest replayとRaid request/recovery処理は保持。旧テーブルの新設、架空セッション生成は行わない。
- 変更対象: GameContext.tsx、useBattle.ts、battleUtils.ts、欠落JPEG、本文書。

## 検証

- Typecheck、Mock環境指定のNext webpack build、diff check: PASS。
- 実関数実行テスト verify_live_battle_resume: 空セッション／Raid優先／Quest未作成／実取得エラー報告／Canonical Tutorial replay復帰・カーソル初期化 PASS。
- Raid ticket recovery 6ケース、Tutorial encounter parity PASS。
- 導入済みSupabase SDKのmaybeSingle: 0件・1件成功、複数件エラー保持 PASS。
- 既存verify_quest_battle_result_livenessは未変更usePatrol.tsへの正規表現assertion（54行目）でFAIL。全体スイートPASSとはしない。
- Raidの旧互換保存は従来も404で失敗していた。Result後の正式ackを保持し、再生中のrequest recoveryを失わない。
- 新Previewの実機でバナー表示・タップ遷移と、reload後に今回の406/404が再発しないことは受入待ち。
