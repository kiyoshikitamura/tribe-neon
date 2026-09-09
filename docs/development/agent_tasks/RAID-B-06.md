# RAID-B-06 — Room生成画面・RPCアダプター
TASK ID: RAID-B-06
OWNER: raid_b_phase6
PRIORITY: P1
STATUS: VALIDATED
SCOPE: Room画面とdomain client/transportの生成操作。A契約 create_raid_room_v1(difficulty,variant,requestId)→Room DTO / list_raid_room_boss_choices_v1()→{choices:[{raidVariantId,name}]}。既存transportへのoptional生成機能追加で旧fixture互換。生成ボタン→boss選択→サーバー生成→返されたRoomへ遷移。操作中spinner/二重タップ抑止、失敗/再送requestId同一、payload変更時新ID。未接続/停止を成功扱いしない。QA専用のメモリfixtureで生成操作を確認可能にする（HP値はサンプル）。追加費用なし、戦闘RPは別を簡潔に表示。既存参加からReplayの契約は変更せず公開参加RPCを勝手に呼ばない。関連React/adapterテストも担当。専有paths src/domain/raidRoomClient.ts,raidRoomRpcTransport.ts、新規必要なdomainファイル、RaidRoomBrowser.tsx/CSS,QA fixture,tests/raid-room/*。
DO NOT TOUCH: SQL、GameContext、共有UI、battle engine、deploy
DEPENDENCIES: 第5工程VALIDATED、基準67070ed。ユーザーは作成追加費用なしの確認に進めてくださいと回答。
ACCEPTANCE CRITERIA: 指定処理と失敗・境界を実装検証。生成成功と戦闘開始成功を分ける。
VALIDATION: 関連テストと親全体型検証/build。実DB/Human PASSは別。
EXPECTED OUTPUT: 日本語Completion Reportと未完了点。
BRANCH: codex/raid-room-rescue-20260908
COMMIT: 本契約とphase6_integrationを含むPR head
BLOCKERS: 公開運用は旧開始/終了/報酬経路の分離・新戦闘接続前には有効化しない。


親範囲追補: RaidRoomConnectedBrowser.tsxのenableCreation opt-in伝播を含む。Aと合意した返却キーはchoices/raidVariantId。


Completion Report:
- optional createRoom/listBossChoices と enableCreation opt-in を追加。A正式APIキーへ対応し応答DTOを検証。
- 難度・ボス選択、追加費用なし/RP別の案内、spinnerのみ、作成成功Room表示、一覧復帰時の再取得を実装。
- 同内容の失敗再送は同requestId、payload変更は新requestId。controller存続中の保持でありページ再読込みを跨ぐ永続保持ではない。
- 作成中の二重送信とjoin競合を抑止。選択変更後の古い応答も画面へ反映しない。
- QA生成はメモリfixtureのみ。新Roomは参加資格unknownでReplayを捏造しない。新Room参加者は返却ownerから取得し戦数/Damageは0。
- 検証: Node共通/adapter45件、React操作19件、全体TypeScript PASS。親統合build・ブラウザ操作・実DB/Human確認は別。
- 公開参加・報酬・戦闘の接続は未実装。実DB操作/Git操作/Deployなし。

親レビュー・機械検証完了。根拠: raid_room_phase6_integration.md。公開運用・実DB・実機は未完了。
