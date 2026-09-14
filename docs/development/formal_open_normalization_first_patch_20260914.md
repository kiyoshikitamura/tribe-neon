# 正式オープン正常化：画像非依存の先行修正

## 位置付け

- 統合仕様：332b6c5148ab18e016f81ad2c2fa90e8ff17c05e の管理MDを原文で取り込む。
- 修正元：Activity受入済み 7d474ff58c251e93fcc07e709fbba15a7f3cde65。
- このブランチは取り込み用差分。Current Productionの実配信SHAはこの環境で未確認。正式Candidateと扱わない。
- Vercel担当CodexがCurrent Productionの実SHAを取得し、そのancestorを持つ統合候補へ受入済み成果と必要差分を取り込む。
- 画像制作は別スレッド。画像・DB・Migration・環境変数・Productionへの変更なし。

## 今回の修正

### 正常化6：MyPage小Raid削除

HomeTabのminiNavigationItemsからRaidだけ削除。ボーナス・Mission・Rankingを維持。大Raid導線、Encounter再案内、Activity救援処理は保持。

### 正常化8：Survey PresentのExact Source

GameContextの「SWR追加プレゼントフェッチ」useEffectが、ログイン中にPresent Inboxを開くと1500ms後にp_swrを追加していた。Mock判定なし。この架空報酬追加useEffectを削除した。
正規Present取得・Claim・bootstrapを変更しない。DB行は削除しない。

### 正常化10：Character一覧バッジ（部分修正）

CharacterSystemV2のpartyIndex===0による「リーダー」表示を廃止。
identityLeaderCharacterIdと一致するキャラに「リーダー」、partyIndex===0に「先頭」を表示。
保存Leaderが編成外でもLeader表示を失わない。

**正常化10全体は未完了。** CharacterPartyには保存先頭をLeaderとして扱うUI、GameContext.handleSetPartyLeaderには編成順序とIdentity更新を一緒に扱う経路が残る。単純に文言だけ変更せず、RPCの実定義と既存Profile Leader変更経路を確認して分離する。

## 検証

- Typecheck（tsc --noEmit）：PASS
- 変更3ファイルESLint --quiet：PASS
- git diff --check：PASS
- Preview実画面：未実施
- Build：本差分では未実施。Vercel実設定Buildで確認する。

## 次の実画面Acceptance（Vercel担当Codex）

1. 新規／既存QAでInboxを開き、1500ms以上待機、閉じて再表示、Reload、bootstrap refresh後もSurvey報酬が追加されない。
2. 実在する正規Presentの表示・受取が成立する。
3. MyPageの小Raidだけが消え、大Raid・Banner・Activity救援・Encounter再案内が維持される。
4. 保存Leaderと編成先頭が異なる状態で、Character一覧のLeaderと先頭が正しく区別される。編成外Leaderも確認。
5. 320px／390pxでバッジの見切れ・重なりがない。

## 画像を待たない残作業

- Skill +値表示への統一、Character/Equipment EXP Authority確認と正常化。
- Room Raid Mission finalize hook、Guild在籍日数投影。
- Quest初級Default（新仕様）、Main Formation統一。
- Gameplay報酬の直接Bag付与。既存未受取Presentは移行・削除しない。
- AP MAX50（既存50超を保持）。
- Season Close/Snapshot/受取猶予/New Season、限定Emblem付与の冪等性処理。画像そのものは後から統合する。
- Billingは最後の一気通貫Acceptance。設定不足を解消できる担当作業は先行準備可能。

## 未確定を埋めない

- Character/Equipmentのrequired EXP曲線は要正本確認。見つかったuser_level_progressionはPlayer用であり転用しない。equipment_progressionは能力倍率とcapで、required EXP表ではない。
- Guild tenureのDay0/Day1は既存Authority確認後、存在しなければ仕様判断依頼。
- 日付は9/15予定・Gate優先。延期時はSeason・告知も整合更新。

## 受入結果の継承

Chat・Activity・Reduced Motion・専用演出の既存PASSは維持。報酬配送変更後はRaid配送の旧Present経由PASSを直接Bag付与のPASSに流用しない。
