# 初心者Mission「TRIBEに参加しよう」統合

## 確定仕様
既存MIS_N_P010を名称変更して再利用。既存Guild加入または新規Guild設立のOR条件。設立必須ではない。
報酬は既存NORMAL_GACHA_TICKET_RANDOM×1＋CASH300、一回限り。別Mission・追加報酬なし。受取済み状態を保持。
Guildページの閲覧・加入申請のみは未達。既存所属または成功済みguild_joined実績は再加入不要。
MyPage推奨文言とMission CTAをTRIBEへ統一。加入/設立を選べるGuildページへ接続。
Guild閲覧でJourney自体は先へ進める従来の非強制方針を維持。未達Missionは残る。

## 3 Authority
Customer Journey: 仲間の集まりへ参加する方法を知る。
Game Cycle: Raidで認識した他ユーザーとの協力をGuildでの継続交流へ接続。
Motivation Cycle: 仲間と遊びたい→既存Guildへの参加または自分のGuild設立→交流・再訪。

## 重複/報酬棚卸し（Preview READ ONLY）
- 加入/設立成功に該当する有効MissionはMIS_N_P010のみ。両RPCが既にGUILD_JOINを評価。
- MIS_D_006: Guild活動、強化ドリンク小1。参加と別条件。
- GVG_PREP_11: Chat投稿、スキル指南書1。参加と別条件。
- MIS_N_U005/U006: 在籍30/90日、Normalランダム2+CASH300 / Specialランダム1+CASH500。別条件。
- 所属済みなのにP010未達/未生成は3人。snapshot同期で既存一回報酬を認識、追加上限なし、自動付与なし。

## 実装/検証
Preview sufvuqdnqohpfzkwxohqへ20260912222025_beginner_tribe_participation適用済み。再適用禁止。
実RPC ROLLBACK検証PASS: create_guild_v2、join_guild、閲覧のみ除外、既存所属、300CASH+Ticket1、二重受取拒否。
テスト初回の閲覧fixtureは汎用record_funnel_milestone対象外で失敗。fixture作成方法を修正し全transactionを再実行してPASS。製品の閲覧経路変更なし。
既存Journey/受取focused test PASS。新候補のUI実画面は配信後に確認。
Production/共有alias/環境変数変更なし。
