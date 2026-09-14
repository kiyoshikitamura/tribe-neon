# 本番由来不具合の追加消化・統合記録 — 2026-09-14
基準SHA: 141833fcc20c89b1fdc69bcc0b9edda8c9293b5c
Preview DB: sufvuqdnqohpfzkwxohq
Production: NOT EXECUTED

## 今回修正
### BUG-07 PvPのTrigger配送漏れ
finalize本体だけでなくon_canonical_daily_activity_finalizedまで追跡し、毎戦素材と3戦報酬がPresentへ配送される漏れを修正。
既存canonical_daily_activity_claimsを重複防止に使用。素材数量・CASH・資格・日付を維持。
正式Resultに実際のclaimをreward_items/INVENTORYとして保存し、useBattleのPvP結果に表示する。
旧Present・確定Result・過去claimは変更しない。
Preview適用: gameplay_battle_activity_direct_rewards / 実version20260914134438 / Repo20260914160000。
適用後に正式finalize×3・再送・Result一致・Present増0・素材付与拒否時の全取消を再確認しROLLBACK。
Quest/Mission/Login/Room討伐・救援/Daily・Season Rankingも各正式grant入口を実DB rollback検証PASS。資格獲得からの実ゲーム全経路を再現したものではない。
旧サービス専用・非Roomの未接続配送はbug07_gameplay_direct_reward_reaudit_20260914.mdに明記。

### Character成長曲線
旧fixture UUIDとの対応作成は行わない。現在のPRODUCTION_FROZEN canonical JSONに既存60名の成長型が定義済みである。
この60名の割当をそのまま維持し、承認済み指数/ROUNDをserver/clientへ接続した。
現在の割当は5型各12名、HP_TANK0名。6型指数を実装するが人数を合わせるための再配分はしない。
以前示したATTACKER11等の件数は旧release/battle masterに由来するため、現canonical割当として扱わない。
Preview適用: canonical_character_growth_runtime / 実version20260914134359 / Repo20260914220000。
適用後360ケース(60名×Lv1/50/100×覚醒0/5)でserver/client完全一致、current Power整合、通知trigger Oを確認。
Lv端点・覚醒倍率・所持Lv/EXP/素材/資産は維持。Guildのcurrent Powerは個人projectionに追従。
current Power再計算中だけ通知専用triggerを同一transaction/table lock内で一時停止し元の状態へ復元。他trigger・RLS・Season保護を無効化しない。
既存Battle/Ranking snapshot/Activityはmigrationで書き換えない。

## 修正不要と確認できた範囲
- BUG-01/06/08: src/Edge407ファイルとSQL445ファイル確認、取得失敗0。Skill Lv/旧Client state/Survey placeholderは現行ソース0。小Raidなし、大Raid/Banner/Activity保持。
- BUG-03: 実Room finalize50回、Daily・10/50累計・retry・late・cancel/receiptなし/非Raid・Clear資格を実DB rollback検証PASS。
- BUG-04: Day1実装・同期の既存定義一致。既に行った境界検証を根拠に保持。
- BUG-09/10: Main Formation、Favorite Leader、Public Profileのコード/DB参照一致。保存済み編成1件をREAD ONLY snapshotへ構築し5名/slot/Skill/Equipment fields確認。
- BUG-05: 以前のユーザー実機OKを維持。今回再操作なし。

## 既存資産・検証データ
成長migration直前/直後の22保護表＋trigger状態のhashは一致。
報酬適用後も所有/Lv/覚醒/LB・CASH・素材のfingerprintは従来と一致。
検証用Triggerは不存在、Gameplay ledger12/Daily claims18/PvP finalized18/Room clear21を維持。
その後の別接続比較ではusers/日次activity snapshotが変化したため調査。apply後に1ユーザーのlast_active_atが更新されていることを確認。その他比較対象・資産/報酬件数は不変。並行利用による活動更新をテスト残存と混同してresetしない。
同一transaction内での21表hash一致検証と、並行利用がある別接続間の比較を区別する。

## 未決事項・環境制約
formal_open_pending_decisions_handoff_20260914.mdの3テーマをユーザーへ依頼する。
1. Season間PvP可否とRATE/Season Wins/Daily Wins。
2. 個人/Guild総合力の通常Season終了報酬の既存定義。
3. 売上KPIの計上/返金/分母/除外契約。
素材は実行環境障害でscratch添付を読めず未統合。Library経由で添付を読む代替は使用しない。
Vercel team接続403で環境診断/固定URL取得不可。GitHub連携のPreview Build結果と、実機受入・決済E2Eを区別する。
実機確認は素材と残件をまとめて依頼する。今回実UI操作・Production変更は行っていない。
