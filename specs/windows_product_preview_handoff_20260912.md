# Guide × Mission統合：専用Preview配信・差分監査

Repository: kiyoshikitamura/tribe-neon
Branch: codex/product-preview-20260912-694db8f
親の最終報告SHAを独立フォルダへfetch/checkout。既存Windows作業を上書きしない。

## 配信
既存Vercel CLI認証でPreview targetのみ。
Team: kiyoshi-kitamura / Project: tribe-neon
Project ID: prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb
Supabase: sufvuqdnqohpfzkwxohq
Production、共有alias、環境変数は変更しない。秘密値を表示しない。
固定Preview URL / 配信SHA / Deployment ID / Supabase ref / READY / HTTPを返す。

## DB
20260912183652_beginner_mission_journey_authority.sqlは親側でPreview適用・実関数ROLLBACK検証済み。再適用・一括db push不要。過去適用済みMigrationも再適用しない。

## 差分監査
判断Authority: guide_mission_integration_mapping_20260912.md、guide_mission_implementation_20260912.md、post_tutorial_judgment_authority_20260912.md。
1. Login Bonus後、未経験の無料Skill/Equipmentへ誘導。Tutorial内装備/Questの既達成をやり直させない。
2. 行動完了後の報酬CTA→対象Mission→受取→結果確認→Home→次の未経験機能。Gacha/Battle/Result中に割り込まない。
3. 未受取のまま後続を経験→過去Stepへ戻らない。古い報酬は受け取れる。
4. 個別/一括/通常Missionからの受取を区別。初心者経由だけHome帰還。通信失敗/再試行/閉じる/二重受取を確認。
5. Raid未開催→Guild閲覧→終端。参加実績・参加報酬なし。開催後の再提示は再現条件がない場合未検証。
6. 前回PASSのTutorial/Quest/Mission/Rankingは接続回帰のみ。Repository全面再監査不要。

Preview/Develop QAは事前確認なしで作成可能、qa集計除外。認証情報は出力しない。
新候補の実画面未確認をPASSとしない。ユーザーの全ページ一括実機確認は統合監査後。
Questデザイン、既知の総合力/回復集計表示差、POWER次期期間は今回対象外。Production変更は別途明示承認後。

## TRIBE参加Mission追補
MIS_N_P010「TRIBEに参加しよう」へ統合。加入/設立どちらでも一回達成。Preview Migration 20260912222025_beginner_tribe_participationも適用済み、再適用不要。
配信後は名称、GuildへのCTA、加入/設立後の報酬CTA→受取→Homeを差分確認。加入をJourney終端の必須条件にはしない。
