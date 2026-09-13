# 初心者Mission全体修正・実機指摘Authority

状態: 08eb15dの実機指摘によりJourney受入を修正待ちへ戻す。実装修正済み、専用Preview実画面監査待ち。未検証をPASSとしない。

## 原因と判断
前回はMission既達成/装備状態/COMPLETED派遣を初心者の機能経験へ混ぜたため、Tutorial内の実績でTutorial後の装備・Quest案内を飛ばした。無料で得たスキル/装備を使い、CASHを獲得して次へ進む体験が成立していない。表示上の通過やRPC成功だけでは合格にしない。

## 全体順序
Login Bonus → 無料Skill → 無料Equipment → キャラで装備 → QuestでCASH獲得 → PvP → Raid → TRIBE → Mission/Reflow。
Tutorial内の操作をTutorial後学習の達成と混同しない。Tutorial後の自由行動で実際に済ませた機能は巻き戻さず、報酬受取は進行条件にしない。
Raid未開催は参加/報酬を達成扱いにせず次へ。TRIBE閲覧でJourney継続可能、加入/設立の報酬は実成功のみ。

## 表示・テキストの共通ルール
- MyPage推奨CTAは全段階で「ミッション」ラベルと具体的な行動名。ラベルと本文の文字階層を分け、長文は折返し可能とし読めない縮小をしない。
- 「その他の未受取報酬」ボタン廃止。過去報酬は既存Mission入口/バッジから確認する。
- 無料獲得/装備/Quest/PvP/Raid/TRIBEの体験終了後、報酬が受取可能なら共通ダイアログ「ミッション達成」「ミッション報酬を受け取る」。ページ上部に戻らなければ見えないCTAは使わない。
- Gacha演出・Battle・Result・既存完了Feedbackに割り込まない。同じ未受取状態で無限に再表示しない。
- 受取済みの報酬を再付与しない。報酬がない場合も次行動への接続を確認する。
- データ構造名、英語内部名称、実装説明はユーザー文言に出さない。

## 共通ダイアログ遷移ルール
決定 → 即時連打防止 → 処理/遷移先準備中も背景操作を遮断 → 遷移先の状態と表示を反映 → 旧ダイアログを閉じる。
旧画面だけ操作可能になる中間状態を禁止。固定の待ち時間で解決しない。非同期処理をvoidで捨てない。失敗はその場で案内/再試行、旧callbackで新dialogを閉じない。おまかせ装備・Mission遷移・受取後Home等の共通部へ適用。

## Mission画面
日次は最上部に進捗バーとn/母数のみ。巨大な日次概要/3件5件の別パネルは廃止、既存報酬は通常一覧へ残す。
「ミッション報酬」「受取可能」を二重に作らず、受取可能一覧へ統一。該当Missionを優先表示し重複行なし。未達/受取済みの整理と既存カテゴリは維持。
個別/一括どちらでも初心者導線からの受取は獲得確認→MyPage。通常Mission閲覧では不要な自動帰還を追加しない。

## 差分Acceptance
1. Fresh Tutorial終了直後は無料Skill/Equipmentを案内。無料後は装備が次になり、Tutorial実績でPvPへ飛ばない。
2. 装備完了→完了Feedback→報酬dialog→受取→Home→Quest。
3. QuestでCASH受領→報酬/次行動→PvP。実機表示で正順を確認。
4. Raid未開催→TRIBE→終端、開催後の再案内。既存Guild加入/設立はOR条件。
5. 自由先行達成、受取放置、Reload、既存ユーザーで巻戻し/二重報酬なし。
6. 決定連打/遷移中の背景タップ/通信失敗/取消/新dialog切替を共通部で確認。
7. Missionバー・一覧・CTA文言をモバイル画面で確認。進捗母数と受取数を混同しない。
ユーザーの再確認は全経路の統合確認を終えてから依頼する。Production変更なし。

## この環境の画面検証制約
control-browserでローカル候補 http://127.0.0.1:3000 へ接続を試みたがnet::ERR_BLOCKED_BY_CLIENT。ブラウザで新候補の画面を確認できていない。自動検証のPASSを実画面PASSと扱わない。
外部専用Previewで上記全経路と共通dialog遷移の差分監査を行ってからユーザーへ戻す。

## 検証結果
Previewに20260913014208_beginner_post_tutorial_experience_order適用済み。
実DB ROLLBACK PASS: Tutorial内実績分離、先行Quest、手動装備成功/同値更新除外、報酬状態と順序独立、既存受取/二重付与防止/日次/未開催Raid。
全Journey順序・完走済み巻戻し防止・報酬prompt条件・受取reflowテストPASS。
共通dialogのhandler runtime検証PASS: action/dismiss同commit、pending連打防止、失敗再試行、新dialog分離。commit adapterによる検証であり実ブラウザReactDOM検証とは区別する。
Security advisor: 本人専用get_beginner_mission_journeyのauthenticated SECURITY DEFINER公開通知のみ対象一致。anon実行禁止・本人auth.uid限定・search_path固定を維持。新Triggerは直接実行権限なし。

## 既存ユーザー履歴の制約
Tutorial完了58人に時刻欠損なし。既存first_main_loadout9件はTutorial完了以後。Tutorial完了後の出発/完了を証明できるQuest8人を補完。
既存装備成功の時刻履歴がなく、装備済みだがfirst_main_loadout/完走factを持たない26人はTutorial内外の区別を証明できない。未完走の場合は装備案内再表示の可能性が残る。完走済みは過去の学習へ戻さずRaid再案内のみ保持。報酬再付与や資産変更なし。

Next.js build/TypeScript PASS。最終追加のPvP BP回復・Raid回復・Friend解除も共通ルールに合わせ先行close/void Promiseを修正、最終TypeScriptに包含。Production未変更。
