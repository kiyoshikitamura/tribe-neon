# 第3工程 先行表示契約

基準4e50a455947d837df66b4ecc64f755a13b8f83ff。専用branch codex/raid-detail-step3-20260909。

親だけが RaidRoomBrowser.tsx / RaidRoomConnectedBrowser.tsx / RaidTab.tsx / domain/raidRoomDisplay* / migration / 統合docsを編集する。A/B/Cは以下専有ファイル。共通CanonicalDialog/PublicUserProfile/GameContextは変更せず既存を利用する。必要な変更は親へ連絡。

A `RaidRoomDetail.tsx/.css`: 表示専用。propsは room:RaidRoomDto, briefing:RaidRoomResource<RaidRoomBriefing>, display:RaidRoomResource<RaidRoomDisplay>, participants:RaidRoomResource<readonly RaidParticipantDto[]>, currentUserId?:string, now:number|null, busy:boolean, onParticipants/onRewards/onEnemyInfo:()=>void, action:ReactNode, rescue?:ReactNode。Aがexport interfaceを定義し親/Cに連絡。敵はbriefing.variant→既存raidTopAssets。owner iconはdisplay.leaderCharacterIdsで既存master解決。本人貢献は既存participantsのappliedDamage/finalizedBattles、未取得は未知のまま。主操作/actionは親が既存参加/出撃処理を渡す。roleはdisplay、なければownerID/briefingで既知のみ表示。未参加の参加者入口は既存参戦者限定権限を維持。敵情報入口は親が既存RaidEnemyRosterへ接続するが全面改修は次工程。

B `RaidRoomDialogs.tsx/.css`, `RaidRoomClearRewardPanel.tsx`, `RaidRoomRescueRewardPanel.tsx`, 新規共有RewardItems等: dialog propsは kind:'participants'|'rewards'|null, roomId:string|null, ownerUserId?:string, currentUserId?:string, participants:RaidRoomResource<readonly RaidParticipantDto[]>, onClose:()=>void, onRefresh:()=>void, onOpenProfile?:(userId:string)=>Promise<void>, profileOpen?:boolean, renderRewards?:(roomId:string,close:()=>void)=>ReactNode, rewards:RaidRoomResource<readonly RaidRewardDto[]>, resolveRewardName?。既存CanonicalDialogをレイド専用CSS wrapper/portalで安全に使う。profileOpenは既存activePlayerDetailが開いている状態。行タップは一旦一覧を非表示にして既存onOpenProfileを呼ぶ。戻ると同じ一覧とscrollTopを復元、重ねない。親がcurrentUser/ownerと画像補完済participantsを渡す。プロフィール内のGuild/DM遷移も既存扱い。

B報酬panel追加prop plan?:RaidRewardPlan（src/domain/raidRoomDisplay.ts）。予定itemsにpresentIdや受取状態を捏造しない。既存reward.itemsは発行済みPresentのみ。clearの厳密な貢献threshold > とrescue >=/戦数を維持。アイコンは既存item master/共通部品から。onOpenPresentsは既存通常BOXへ。閉じる常時可能、390x短画面/safearea/footerを検証。

親API補完: 必要な最小read `get_raid_room_display_v1(p_room_id)` を検討・実装。ownerGuild、最大20人+ownerのleaderCharacterIds、本人membership、clear/rescue予定itemsだけ。既存room/briefing/participants/rewardの処理は保持。予定はconfigured/unconfigured、発行itemsと別。追加SQLは親排他、隔離PGで検証。

C `src/app/qa/raid-detail/`, `scripts/raid-detail/`, `tests/raid-room/detail-*`, `docs/development/raid_detail_step3_validation.md`, 証跡。実HubPage/実コンポーネント/既存プロフィールでモーダル数・位置往復・390短高scroll/fixed closeを確認。仕様上のMockと実データ接続を区別。親がSQL検証/全体型/build、CがUI/回帰を分担。

子commit/push/DB接続/外部変更なし。A/B完了→親統合→C最終撮影。DB SQL案の並走は不要、親のみ編集する。
