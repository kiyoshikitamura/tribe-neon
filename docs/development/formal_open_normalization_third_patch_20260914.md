# 正式OPEN 正常化 第3差分 / 2026-09-14

## 対象

EXP正本の回収と独立して、正式管理MDで確定済みのAP MAX50・Quest保存Main Formationを修正する。
前提差分は0b731e97adba76bd6ad5a6c004616738c23115a0（第1・第2差分包含）。
このブランチは統合用差分。現行Production SHAをancestorに持つ正式候補の作成・Vercel検証は別工程。

## AP MAX50

- 自然回復上限とFresh初期値を50へ。既存50超残量を減らさない。
- 上限滞在後の探索消費時に回復時計を再開。
- 回復アイテム+50、overflow上限500、PvP/Raidポイントを保持。
- Canonical JSON/表示定数/mock/DB関数を揃える。
- Quest費用3/10/20、無料時短5回を保持。

## Quest戦闘

- client準備とserver Replay snapshotの両方で保存Main Formationを使用。
- 探索担当・地元ボーナスsnapshotは変更しない。
- 防衛デッキ/探索担当1名へのfallbackを撤去。保存Main空は拒否。
- 既存Main契約の1〜5人を保持。探索開始を理由に自動編成しない。
- 既存Replay、Leader Identity、Raid処理を維持。

## Migration候補（未適用）

- 20260914074959_formal_open_ap_max_50.sql
- 20260914075032_quest_main_formation_authority.sql

## ローカル検証

- Typecheck、変更ファイルESLint、git diff --check：PASS。
- tests/db/ap-max.test.mjs：実回復/探索RPCで上限、50超保持、消費後時計、アイテムoverflow拒否、Fresh defaultを検証PASS。
- scripts/test_quest_main_formation.mjs：実Main取得/Quest生成RPCで保存順5名、master ID、探索担当との分離、空編成rollback、authを検証PASS。
- Questテストのsnapshot builderは入力記録double。既存技能/装備計算は継承し、実画面を代替しない。
- Tutorialは既存20260823000192で所有最大5名をsave_main_formationへ保存することをコード確認。Fresh実画面は未実施。
- Vercel Build・Preview Acceptanceは未実施。

## 外部Codex Acceptance

1. 現行Productionとの差分を確認して正式候補へ包含。
2. Previewで必要Migrationのみ適用。AP関数の定義不一致はpatchを強行せず確認。
3. AP49→50自然回復、50以上維持、既存100/120保持、探索消費後の時計、Fresh初期値50。
4. 探索担当≠Main・防衛デッキ≠Mainで、準備/戦闘のキャラと順序が保存Mainと一致。
5. Fresh Tutorialのおすすめ編成保存→Quest→Battle→Resultを確認。
6. 探索担当・地元ボーナス・報酬・Leaderを維持。既存Raidの影響箇所のみ回帰。

## EXP

個数加算は不具合。過去FIXを優先する。現在の暫定マスタを正式数値として採用しない。
過去FIXのCharacter/Equipmentレベル別必要EXP表・式の本文が未回収。新規曲線を逆算・提案しない。
詳細：exp_master_authority_audit_20260914.md。

Production・Preview DB・環境変数・aliasは未変更。画像制作は別スレッド。
