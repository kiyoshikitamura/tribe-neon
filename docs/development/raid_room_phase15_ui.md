# 第15工程 UI — レイドランキング廃止

STATUS: IMPLEMENTED（親レビュー・統合検証待ち）

## 変更
- RankingTabのレイドカテゴリ、日次/Season順位RPC、Guildレイド順位表示を撤去。総合力・Guild総合力・PvP、同ランキング報酬とプロフィール導線を維持。
- 古い `navigateTab("ranking", "raid")` はレイド画面へ遷移。既存の rankingActiveTab が raid の場合も順位RPCを送らずレイド画面へ戻し、ランキングカテゴリ状態は power へ戻す。
- RaidTabの順位指標とレイドランキングボタンを撤去。本人貢献は `get_my_raid_contribution_v1(p_instance_id)` の `{contribution}` のみ取得。未取得/取得失敗はダメージ0と偽らず「—」。再取得・アカウント変更時は旧値をクリア。
- GameContextのbootstrapはレイドSeason順位を取得しない。過去の一覧を空にし、Room/戦闘の貢献計算は変更しない。
- 報酬表示の旧 raid カテゴリ入力を互換保持し、報酬セクションは空で返す。canonicalの歴史的報酬マスターは削除しない。
- Room内の参加者・貢献・救援成功報酬・Presentの受取は変更しない。

## 変更ファイル
- src/app/components/RankingTab.tsx
- src/app/components/RaidTab.tsx
- src/app/components/RaidTab.css
- src/app/context/GameContext.tsx
- src/domain/ranking/rankingRewardPresentation.ts
- docs/development/raid_room_phase15_ui.md

## 検証
- 全体 `tsc --noEmit`: PASS（B初版）
- 製品コンポーネント回帰はC担当、統合build/typeは親担当。
- 実DB・実機・本番停止は未実施。本人貢献RPCを含むSQL261適用後のUI接続が必要。
