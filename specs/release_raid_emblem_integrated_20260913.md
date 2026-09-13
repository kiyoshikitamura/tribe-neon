# Raid修正＋Guild Emblem 統合候補 / Codex配信依頼
2026-09-13

## 統合内容
ユーザー指示により、下記2候補を統合した。
- Raid修正: f2cbdea374dd3ef627ad515f680d772271ef0b40
- Guild Emblem: 5a5101b27377d2df5f5929d7b6e331d8e5e4fb19
Repository: kiyoshikitamura/tribe-neon
統合Branch: codex/release-raid-emblem-integrated-20260913

この候補ではEmblemを含む。以前の個別引継ぎにある「Emblemは別候補/含まない」という記載より、本統合指示を優先する。
HomeのEncounter再案内・Guild IDによるEmblem表示の両差分を保持。競合なし。
既存課金・Special・専用演出コードを保持し、追加仕様変更は行っていない。

## 統合後確認
- Typecheck: PASS
- Raid準備のProvider契約を使う6ケース: PASS
- Encounter再案内の同じRoom/確認済み/期限・終了ガード: PASS
- Snapshot生成PGlite SQL（実敵builder、登録等はfixture）: PASS
- Emblem権限・所有PGlite SQL: PASS
- Emblem batch/dedup/cache期限/更新競合/失敗時保持: PASS
- Next build: ローカルMock設定でPASS
- Home自動統合箇所のdiff確認: 両機能保持
Vercel実設定Build・Live Migration・実画面受入は未実施。SQL試験を実接続PASSと扱わない。

## Codex依頼
本統合Branchの先端を取得し、専用Previewで以下を進める。
1. Supabase Preview sufvuqdnqohpfzkwxohq と接続設定を確認。
2. 履歴照合後、以下の未適用Migrationだけを適用。
   - 20260913133311_guild_emblem_standard_identity.sql
   - 20260913142410_quest_raid_combat_snapshot.sql
3. Deployment限定のNEXT_PUBLIC_RAID_ROOM_UI_ENABLED=trueを保持。Mockを無効にした実設定で配信。
4. 不完全な既存Encounter Roomの再利用時だけ、明示allowlistの修復手順を実施。通常Room・戦闘済みRoomは対象外。
5. Raid出撃準備→Battle→救援→報酬2倍→受取/再受取拒否、あとで→Home→同じRoom、通常Raid回帰。
6. Emblem Master/Sub Master変更→全主要表示→Reload、Member/他Guild拒否、背面操作防止、長いGuild名/モバイル。
7. Billing Sandbox不足設定を補い、決済・Webhook重複・期限・Specialの実画面検証。

詳細手順:
- specs/raid_release_blocker_codex_handoff_20260913.md
- specs/quest_raid_combat_snapshot_fix_20260913.md
- specs/guild_emblem_codex_acceptance_20260913.md

Billing不足:
BILLING_SANDBOX_ENABLED=true / STRIPE_SECRET_KEY(test) / STRIPE_WEBHOOK_SECRET / BILLING_RETURN_ORIGIN。
既存安全な設定元を使用し秘密値を出力しない。Vercel検証はCodex担当。Plugin接続追加依頼なし。

## 公開判断
本作業ではLive DB・Vercel設定・Production・共有aliasを変更していない。
Git連携による自動配信が発生しても受入完了ではない。
Codexへの配信・検証依頼は可能。
Production反映およびユーザー実機確認依頼は、Raid/Billing/Emblemの実画面受入後に判断。
Cut-in停止位置・透過素材の既知残件も別途残る。今回の統合で解消扱いにしない。
返却: SHA/Deployment ID/URL/DB ref/適用履歴/実画面PASS・FAIL・未検証/実機依頼可否。

