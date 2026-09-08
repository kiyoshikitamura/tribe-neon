# Raid第4工程 — VALIDATED
A-04: 非公開サーバー条件判定と設定分離、C-04: SQL/境界/権限検証。B-04: Previewで発見したRaid操作中ラベルの規約修正（共有OutlawButtonはB専有）。親は仕様根拠照合・レビュー・統合を担当。生成/参加writerは構造条件の根拠未確認のため未着手。バランス再検討は行わない。A/B/C/P-04は親レビュー・機械検証済み。条件SQL14件、React操作10件、既存共通43件、全体Mock build/型検証PASS。既存PreviewのサンプルRoom操作をChromeで確認したが、実DB戦闘・報酬・実機Human PASSは未到達。詳細: raid_room_phase4_integration.md。

# Raid第3工程 — VALIDATED
A-03: Room台帳/参照RPC、B-03: 実RPC adapter/画面接続、C-03: SQL/adapter検証。親が全体typecheckと統合を担当。作業ルートはraid-room-repoのgit checkoutへ移行。PR #27更新時の完了通知を有効化。未検証を完了通知しない。A/B/C/P-03は親レビュー完了。共通43件、SQL/接続18件（adapter9重複）、全体typecheck、Mock全体build、QA HTTP/SSRがPASS。ブラウザ・実機・実DB適用は未検証。詳細はraid_room_phase3_integration.md。

# Raid第2工程 — VALIDATED
A-02: Room通信controller / B-02: Room画面 / C-02: 操作・競合テスト。担当契約はagent_tasks/RAID-*-02.md。親は統合とQA導線を担当。共通処理34件・React操作7件と対象strict TypeScriptを検証。開発用 /qa/raid-room を追加、配信URL未発行。実DB接続と本番切替は未実施。

# Raid Room V1 — 現在の開発作業
基準: b08e396e657615afd6dfddc05bbec37d21561a25 / branch: codex/raid-room-rescue-20260908
親: このチャット。子A/B/Cを排他的ファイル範囲で管理する。初回はA型・条件 → B表示/C検証 → 親レビューの順。
|Task|Owner|Status|範囲|
|---|---|---|---|
|[RAID-A-01](agent_tasks/RAID-A-01.md)|raid_a_readiness|VALIDATED|src/domain/raidRoom.ts、docs/development/raid_room_api_contract.md|
|[RAID-B-01](agent_tasks/RAID-B-01.md)|raid_b_readiness|VALIDATED|src/domain/raidRoomPresentation.ts|
|[RAID-C-01](agent_tasks/RAID-C-01.md)|raid_c_readiness|VALIDATED|tests/raid-room/、docs/development/raid_room_validation.md|
仕様: [raid_room_rescue_v1.md](../../specs/raid_room_rescue_v1.md)
全機能の到達順: 共通契約 → Room/参加/戦闘縦通し → 救援/参加者 → 報酬/新旧切替 → Preview複数人検証 → 実機調整 → Release判断。
既存概算91〜158時間は参考レンジ。自律稼働時間の保証ではない。各縦通し完了時に実績と残作業を更新する。
初回Task完了を新Raid実装完了やHuman PASSと扱わない。
以下は固定SHAに残る2026-09-02の履歴。現在の既存製品の状態を再判定したものではなく、新Raidの開始阻害条件へ自動転用しない。

---

# Release Board

## RELEASE GATE

### Pre-Open GO

`NOT READY`

2026-09-02時点の判定。Machine ValidationとHuman PASSを同一視しない。

Blocker:

- Battle Presentation V2 full Skill load stress Human PASS未記録
- Login Bonus UX Human PASS未記録
- Final Cross-Screen Human Acceptance未完了（Desktop / 390×844 / 412×915）
- iPhone Safari / Android Chrome / PC ChromeのProduction候補実機QA未完了
- Audio Lifecycle A–O Human Acceptance未完了
- Production Smoke未完了
- Analytics、広告CV計測、エラー監視のprovider / ID / DSN未確定・未検証
- OGP / favicon / robotsのRelease確認未完了

Machine evidence:

- Battle Full Skill Load fixture / Battle Presentation contract: `PASS`
- Login Bonus recognition contract: `PASS`
- Operations exposure contract: `PASS`
- Final asset technical integrity / Production Creative x9 contract: `PASS`

上記Machine PASSは作業中treeの結果を含む。Release Candidate SHA固定後に同一SHAで再実行し、証跡へ記録する。

詳細判定は [Pre-Release GO / NO-GO Checklist](pre_release_go_no_go_checklist.md)、未確定入力は [Release Gate Input Record](release_gate_input_record.md) を正とする。

## ACTIVE WORKSTREAMS

### BATTLE-PRES-V2

**PRIORITY:** P1 / PRE-OPEN BLOCKER  
**STATUS:** MACHINE PASS / HUMAN REVIEW REQUIRED

**PURPOSE:**

Canonical Replayを変更せず、high Skill loadでもHumanが理解できるBattle Presentationへ改善する。

**DO NOT TOUCH:**

- Battle Formula
- Replay Authority
- Canonical Master
- Damage authority
- Target authority
- Battle Result authority

**GATE:**

```text
Machine Validation
→ Human Acceptance
→ PASS
```

**CURRENT EVIDENCE:**

- Canonical Replay固定fixture、5対5、high Skill loadのMachine ValidationはPASS
- Production QA routeは公開せず、Preview / DevelopmentのQA routeでHuman確認する
- Actor → Target → Attack → Impact → Damage → HP Transition → DefeatのHuman追跡可否は未判定

### LOGIN-BONUS-UX

**PRIORITY:** P1 / PRE-OPEN BLOCKER  
**STATUS:** MACHINE PASS / HUMAN REVIEW REQUIRED

**PURPOSE:**

Login Bonusをユーザーが認知し、翌日以降も何が獲得できるか理解できる状態にする。

**MUST:**

- 当日受取だけでは不足。
- 翌日以降のReward Scheduleを確認可能にする。

**DO NOT:**

- Economy値を推測で変更しない。
- Canonical reward masterを勝手に変更しない。

**CURRENT EVIDENCE:**

- 30日cycle、当日・翌日・未来・受取済み表示、同日冪等性のMachine ValidationはPASS
- 390×844 / 412×915のautomated coverageは存在する
- 当日獲得の認知、翌日以降の理解、overflow / tap targetのHuman Visual / UX PASSは未記録

### INVITE-OMISSION

**PRIORITY:** P1  
**STATUS:** MACHINE PASS / HUMAN REVIEW REQUIRED

**RELEASE DECISION:**

Pre-OpenからInvite機能を`OMIT`する。

**PURPOSE:**

未完成または実質利用不能なInvitation導線をPre-Open User Journeyから除外する。

**DO NOT:**

- Invitation systemそのものを不用意に削除しない。
- 将来復旧可能性を保持する。
- DB破壊・migration rollbackを行わない。

**CURRENT RELEASE MATRIX:**

- `INVITE` / `FRIEND` / `FRIEND_HELPER`: `OMIT`
- `SHOP` / `GVG`: `UPCOMING`
- `PAYMENT` / `SPECIAL_GACHA`: `CLOSED`
- `GUILD_COMBAT_BUFF`: `OMIT`
- `PVP` / `RAID` / `GUILD`: `OPEN`

現行Operations feature-stateをAuthorityとする。旧文書の露出表と矛盾する場合、旧表をRelease証拠に使用しない。Desktop / 390×844 / 412×915で非表示、dead navigation不在、safe-area、戻る・進む、OPEN機能の継続露出をHuman確認する。

## AVAILABLE PARALLEL SLOT

### SLOT-4

`UNASSIGNED`

Main AI Agentがdependency / file overlapを確認してから割り当てること。


## Raid初回成果
A/B/Cの指定範囲は親レビュー済み。対象26テストPASS、strict TypeScript PASS。実画面・DB・Preview接続未実施。次工程はRoomの取得/表示/操作の接続契約と画面。構造条件はspecの未確認事項を照合し、依存する処理だけを保留する。
