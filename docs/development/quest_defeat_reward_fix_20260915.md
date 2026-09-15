# Preview Quest敗北時の報酬・進行修正（2026-09-15）

## 原因

claim_patrol_rewardsがbattle_resolvedのみ確認し、敗北にも報酬と初回クリアを付与していた。初回クリア記録から次難度が解放されるため、Resultの敗北表示と進行が不一致となった。上級完了Mission QUEST_HARD_COMPLETE_COUNTは別途イベント接続が欠けていた。

## 対応

- 敗北はCOMPLETEDへ終了して探索枠を解放。outcome=DEFEAT、CASH/EXP=0、items=[]、first_clear=false。報酬・初回クリア・ミッション・ギルド貢献を加算しない。
- 未解決/不明な戦闘結果は拒否。勝利時は既存報酬・地域ボーナス・抽選を保持。
- 上級勝利時のみQUEST_HARD_COMPLETE_COUNTを加算。既存の行ロックとCOMPLETED再受取拒否を維持。
- UIはサーバーのoutcomeを使い、敗北時の報酬モーダルと報酬SEを抑止。
- Preview記事1件を正式オープン管理文書7.2の文案へ訂正。日時・公開状態・他記事は保持。

## Preview適用済み（再適用不要）

Project: sufvuqdnqohpfzkwxohq
Migration: 20260915090229_quest_victory_reward_authority
Operation: supabase/operations/preview_restore_formal_release_news_20260915.sql
Production変更・配信は実施していない。

## 検証

- 実Preview RPCをtransaction内で検証しROLLBACK: 中級/上級敗北のユーザー資産・Mission・付与ledger不変、初回クリアなし、上級未解放、探索枠解放、再受取拒否。
- 同transactionで新規sourceの上級勝利: 実付与・初回クリア・MIS_N_P005達成、再受取拒否。試験変更は全件ROLLBACK。Migration適用前候補と適用後でPASS。
- PGlite実SQL7群: 認証/所有者、NORMAL/HARD敗北・敗北後初勝利・再勝利、不明結果/未解決/未完了の拒否、旧非戦闘派遣互換。
- 実usePatrol hook回帰、Result liveness、型検査、Next webpack build: PASS。
- お知らせのPreview DB本文と正本7.2一致を確認。
- Supabase security advisor: claim_patrol_rewardsのauthenticated向けSECURITY DEFINER公開は既存の意図した報酬API。auth.uid所有者確認・search_path・権限構造を維持。セキュリティ全件PASSとはしていない。

## 残件・注意

- iPhone実機での敗北Result→Quest帰還、報酬画面非表示、再挑戦→初勝利は未確認。
- 調査時のPreview全体で敗北COMPLETED13件、そのうちfirst_clear=true9件。過去の誤付与・誤解放・Mission進捗は回収/補正していない。修正後の挙動とは分けて扱う。
- お知らせ文面復元はSeason切替・Emblem付与・Pack公開を実施したことを意味しない。正式公開前に文案の完了表現と実作業完了を照合する。
- 実競合試験は今回追加していない。既存PvP初回finalize競合試験の未完了をPASSにしない。
