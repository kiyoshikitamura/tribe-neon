# 初心者Missionの順序判定修正

## 原因と修正
旧snapshotは装備Mission P002/P003のCLEAR/CLAIMEDと、Tutorialを含むQuest COMPLETEDを案内の経験として扱っていた。このため無料ガチャ後にCharacter/Questを飛ばしてPvPへ進んだ。

案内の順序は無料Skill → 無料Equipment → Character装備 → Quest CASH獲得 → PvP → Raid → TRIBE → Mission帰還。Login Bonusは従来の先行表示を維持する。

- Character経験：既存first_main_loadout。おまかせ成功、またはTutorial後の実際の手動装着更新でSkill/Equipment双方が装着された成功状態。
- Quest経験：既存post_tutorial_quest。Tutorial完了後のQuest完了で記録。Character経験/報酬受取は前提にしない。
- PvP/Raid：既存first_pvp/first_raid。
- Guild：既存閲覧/加入Factまたは実所属。報酬は加入/設立に限る。
- Mission CLEAR/CLAIMEDを上記経験の代用にしない。既存報酬額/一回性/受取状態は保持する。
- 自由行動の先行経験は保持。未受取で過去へ戻らない。
- reflow_completedは過去の初心者工程へ戻さない。未経験Raidは開催後の再案内を維持する。

## 過去データ
Preview READ ONLY確認時、Tutorial完了58人、completed_at欠損0。
first_main_loadout 9件は全件Tutorial終了後。post_tutorial_questは既存6件。終了後に出発したCOMPLETED Questに限り8人へ既存Factを補完する。

手動装備の過去履歴には制約がある。P002/P003のmission_event_telemetryは0件。Skill/Equipment行には作成日時しかなく、装着操作時刻がない。装備済みだがfirst_main_loadoutとreflow_completedの無い26人について、Tutorial装備とその後の手動装備を区別できない。26人全員が再操作対象とは断定できず、資産や報酬状態から学習経験を捏造しない。今後の手動装備成功は既存Factへ記録する。

## 検証
- scripts/verify_beginner_mission_journey.mjs：全順序、既CLEAR報酬からの独立、先行経験、受取独立、Raid再案内、reflow済み保護をPASS。
- tests/db/beginner-post-tutorial-order.sql：Tutorial装備/Quest分離、前段装備なしQuest、手動装備成功、同値更新除外、受取独立。親工程でPreview実DB ROLLBACK PASS。
- tests/db/beginner-mission-journey.sql：旧Tutorial通過期待を修正。親工程でPreview実DB ROLLBACK PASS。
- 実画面のFresh全順序は統合Preview配信後に確認する。Production未変更。
