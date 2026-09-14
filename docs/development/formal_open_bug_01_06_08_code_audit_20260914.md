# GAME03 BUG-01 / BUG-06 / BUG-08 コード再監査
更新日: 2026-09-14
基準SHA: 141833fcc20c89b1fdc69bcc0b9edda8c9293b5c
対象branch: codex/formal-open-integration-preview-20260914

## 結論
今回の3項目について、追加コード修正が必要な残存不具合は検出しなかった。実ゲームの新規・既存・reload・Inbox・bootstrap実行を今回行ったわけではなく、コード実装監査として扱う。ProductionおよびDB変更なし。

## 調査範囲と手法
GitHub APIで基準SHAを固定し、src配下およびsupabase/functionsのTS/TSX/JSON計407ファイル、supabase配下SQL445ファイルを全文取得した。取得失敗0件。
検索語: skillLevel / skill.level / SKILL_LEVEL_* / Skill Lv / Skill Level / スキルレベル / p_swr / アンケートのお礼 / survey。
追加でLv.とSkillが同一行にある表示、Present stateの生成・取得、MyPage小ナビ定義と大導線を読んだ。履歴SQLを変更せず、最新の後続Migrationとの関係を区別した。

## BUG-01 Skill Level
- 実行ソース407ファイルでskillLevel、skill.level、SKILL_LEVEL_*、Skill Lv、Skill Level、スキルレベルの該当0。
- CharacterSystemV2: Skillの所持・装備・限界突破はplus_val表示。詳細のLvはassetDetail.kind === "equipment"で明示限定。
- StreetBattleSetupにあるLvは選択CharacterのLvでありSkillではない。
- SkillPresentationはSkill Lvを表示しない。
- BATTLE_FULL_SKILL_LOAD_LEVELはQA編成CharacterのLv100に使う定数。card-visual-skill-levelsは既存QAルートIDで、実際の見出しはSkill +1 to +10。機能と異なる値の表示ではないため改名しない。
- 履歴SQLには旧名称が残る。20260914110224_skill_enhancement_mission_terminology.sqlがGVG_PREP_02をSKILL_ENHANCE_COUNTへ変更し、説明も「スキルを合計5回強化」へ変更している。
- evaluate_mission_progressのSKILL_LIMIT_BREAK→SKILL_ENHANCE_COUNT対応を維持し、旧SKILL_LEVEL_AT_LEAST / SKILL_LEVEL_TOTAL_INCREASE aliasesは既存呼出し互換用として意図的に残る。同Migrationにその理由が明記されている。user_missions/claim/reward/timingの更新はしない。
- 今回はライブDBの適用状況やBattle効果の実戦確認を実施していない。コードPASSとDB/実UI確認を混同しない。

## BUG-06 MyPage小Raid
- HomeTab.miniNavigationItemsはlogin-bonus / mission / ranking。Raidは存在しない。
- Bonusは追加の既存ナビとして残っている。「Mission / Rankingのみ」という旧一覧との個数差は事実として記録するが、別途実装されたBonusを独断で削除しない。小Raid削除要件自体は充足。
- Home大導線はhomeActionPresentationのraid destinationを保持。
- Raid Bannerはhome_bannersのraid_battle_major_updateを読み、destination raidを保持。
- RaidRescueLink、openRaidRescue、Primary CTA関連のRaid availabilityを保持。
- バナー画像の配信HTTPや実タップ遷移は今回未実行。

## BUG-08 Survey Present
- src/Edge 407ファイルとSQL445ファイルにp_swr / アンケートのお礼 / surveyの該当0。
- useInventoryはpresents初期値[]。アンケート等の固定Presentを生成する処理なし。
- GameContextはpresentsをuser_idで取得し、取得行をそのまま表示モデルへ変換する。取得失敗時にMock Presentを追加しない。
- RaidTab.openRescuePresentsも同じ所有者条件で取得・変換する。
- InboxPanelはUNCLAIMEDを表示し、タイトル文字列に基づくsurvey除外を追加していない。正規の運営配布を誤削除しない。
- MockSupabaseClientはNEXT_PUBLIC_USE_MOCK_DB === trueの明示gateでのみ採用。appEnvironment productionでMock指定ならthrow。設定欠落時の暗黙Mock fallbackなし。
- 今回新規・既存・reload・Inbox open・bootstrap refreshの実ブラウザ確認は未実行。コードからplaceholder注入経路がないことを確認した段階。

## 変更・検証
- Application source変更: なし
- Migration変更/適用: なし
- この監査記録のみ追加
- TYPECHECK/BUILD: 追加コード変更がないため今回未実行
- 実UI Acceptance: 未実行（既存のユーザー受入記録を取り消さない）
- PRODUCTION: NOT EXECUTED
