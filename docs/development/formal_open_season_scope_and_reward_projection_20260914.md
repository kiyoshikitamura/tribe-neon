# 第1Season確定事項とプレOPEN報酬投影の修正候補

2026-09-14。監査基準: 8cd58f2cf51ecd970d1ec69e549cc3d3e591c771。
Preview DB: sufvuqdnqohpfzkwxohq。
状態: READ ONLY監査・未適用draft。Production変更、Season実切替、報酬付与は未実行。

## 確定済み

- 第1Season対象: PvP、個人総合力（POWER）、Guild総合力（GUILD_POWER）。
- 終了報酬は現行定義を維持し、新しい数量や報酬帯を作らない。
- 開始: 2026-09-16 00:00 JST。終了: 2026-10-01 00:00 JST未満。
- 9/15は正式OPENとSeason間インターバル。
- 日時のAuthority: docs/development/formal_open_integrated_release_management_20260914.md §3.3。延期時は日時・告知を一括更新する。
- プレOPEN最終Guild報酬は1位限定。名称・画像・IDは素材統合時に既存実装へ合わせる。再度デザインや名称の仕様議論を要求しない。

## 今回具体化した表示修正

現在get_public_ranking_reward_master()はプレOPEN参加賞・1位・2位・3位の4装飾を返す。rankingRewardPresentation.tsのfallbackも4装飾であり、1位限定仕様と不一致。

候補:
- get_public_ranking_reward_master()の既存cosmetic SELECTへid='guild_preopen_2026_rank_1'条件だけ追加。
- PREOPEN_GUILD_COSMETIC_FALLBACKを同じ既存1位報酬1件へ限定。
- 既存名称・quantity=1・rank 1を維持。
- cosmetic本体、slot、画像、既存付与履歴、Season状態、実付与関数、他の報酬payloadは変更しない。

候補Migration: supabase/migrations/20260914210000_preopen_rank_one_reward_projection.sql。
適用は親の統合工程で行う。既存関数の変更箇所が一意でなければ停止するdrift guardあり。

## 検証範囲

PreviewでBEGIN READ ONLY / ROLLBACKにより旧payloadから候補投影を計算:
- guildSeasonCosmetics: 4件→既存1位1件。
- rankMin=rankMax=1、quantity=1、既存cosmetic ID・名称維持。
- その他payload完全一致: true。
- 実関数内のpatch anchor件数: 1。

これはSELECTによる候補投影比較であり、Migration適用や置換後RPCの実行試験ではない。
DDLは永続適用していない。ローカル実行環境停止によりTypecheck・UIテスト未実施。

## Season実装残件

- Preview ranking_period_bounds / advance_all_ranking_seasonsはPVP/RAIDのみ。POWER/GUILD_POWERは新Season開始・終了処理への接続が必要。
- reset_seasonal_power_rankings()はstub。POWERの旧8月ACTIVE、GUILD_POWERのプレOPEN2099年末までACTIVEは変更していない。
- PVPの終了報酬定義は存在するためそのまま再利用できる。
- canonical DB payload、Repository JSON、UI投影には通常POWER/GUILD_POWERのSeason終了報酬定義がない。Daily報酬の存在をSeasonへの転用許可と解釈しない。PVP報酬流用や無報酬を推定しない。
- インターバル中のPvPプレイ可否・RATE/Winsの扱いは既存資料でも未確定。予約だけでは現行finalizerの更新を止められない。
- 実メンテナンスの操作停止時刻・Claim起算時刻が運用入力として残る。

## 素材統合時の既存契約照合

guild_preopen_2026_rank_1は現在slot=GUILD_DECORATION、asset_status=PENDING_FINAL_ASSET。
finalize_preopen_guild_power_season_v2(text)はGUILD_EMBLEMを要求するため、そのまま実行すると拒否する。
素材統合時に既存ID・画像・slot契約を整合させる。今回slotや画像を変更しない。
