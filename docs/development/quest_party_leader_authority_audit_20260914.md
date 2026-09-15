# Quest編成・Profile Leader再監査
基準SHA: 141833fcc20c89b1fdc69bcc0b9edda8c9293b5c
対象DB: Preview sufvuqdnqohpfzkwxohq
状態: コードとREAD ONLY DB確認済み。実ゲーム再操作は未実施。

## BUG-09 Quest Main Formation
- useBattle.tsはPATROL/PVP/RAID開始でget_current_main_formationを取得し、保存slot順を使用。
- 正式Quest RPC create_patrol_battle_replayもMain Formationを取得しbuild_server_battle_snapshotへ渡す。派遣人物を戦闘編成にしない。
- build_server_battle_snapshot_00168は対象人物の所持Skill/Equipmentを取得。正式snapshotがclient仮編成を置換する。
- apply_tutorial_player_snapshot / apply_tutorial_enemy_snapshotは保持。
- BEGIN READ ONLY / ROLLBACKで保存5名の既存編成1件をsnapshot化。保存5名=snapshot5名、slot順一致、全5名にskills/equipment fieldを確認。保存データ・消費・戦闘履歴の変更なし。

## BUG-10 Favorite / Leader
- HomeTab.tsxとCharacterSystemV2.tsxはidentityLeaderCharacterIdを使用。
- GameContext.tsxはusers.favorite_character_idを取得。PublicUserProfileもget_public_profilesのfavorite_character_idを使用。
- Characterのslot1表示は「先頭」、favorite表示は「リーダー」。
- Party保存はsave_main_formation、Leader変更はset_profile_leader_v1に分離。
- Previewのslot1保有77ユーザー中favoriteと異なる17ユーザーは仕様上正常。DBを書き換えない。

## 残る検証
実ゲームでParty A保存→Quest/PvP/Raidの一致、Party変更後reload、MyPage/Character/Public Profileの表示一致。今回のコード/READ ONLY確認を実機PASSとして扱わない。
対象修正漏れは確認されず、BUG-09/10のコード変更・DB変更・Production操作はなし。
