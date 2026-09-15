# 地元一致ボーナス 確定仕様 — 2026-09-14

Authority: 本流ユーザー承認。旧LUK連動仕様を新規開始Questについて置換する。

- CASH: canonical Quest基礎CASHの10%。EASY +60 / NORMAL +120 / HARD +200。サーバー計算。
- Drop: 全難度+200bp（+2%ポイント）。既存100%上限・基礎0%除外を維持。
- LUK連動なし。Character LUK・成長型は変更しない。
- 一致判定は既存の担当1名と探索先の正規化地域を維持。
- 新規開始時にversion2 / matched / cash_bonus_rate / cash / drop_bonus_bpを保存。
- 開始済みversion1 Snapshotはそのまま使用。user_patrolsの一括更新を禁止。
- claim_patrol_rewardsは既存Snapshot値を使う構造を維持。基礎CASH、基礎Drop、Mission/Raid/Ranking報酬を変更しない。
- 今回はPreviewのみ。Production反映は別判断。
