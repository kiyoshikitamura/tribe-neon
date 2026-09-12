# 統合Preview実画面監査と修正追跡

## 監査の出典
ユーザー共有のWindows Codex監査結果。対象SHA `1a814d7722a4979669b0a80bd2555515f803da2f`、固定URL https://tribe-neon-f9lx3ik3d-kiyoshi-kitamura.vercel.app 。Supabase Preview `sufvuqdnqohpfzkwxohq`。
親側で同じ実画面監査を実施したという意味ではない。画面キャプチャ本体はこのRepositoryへ未受領。

QA表示名は「統合QA」、匿名認証・Tutorial完了・KPI qa除外。Windowsブラウザの「続きから」で再利用可能。セッションは別端末・別Originへ自動共有されない。秘密値は保存しない。

## 受領結果
|対象|結果|確認済み／問題|
|---|---|---|
|Quest|PASS|派遣→無料時短→Battle→報酬→再派遣。状態・報酬・担当・派遣先の認知|
|MyPage|PARTIAL|主要導線、Missionバッジ7→6→3、Reload保持はPASS。SSR Activity露出、Guide停止|
|Mission|PARTIAL|個別・一括・重複防止・Reload・段階開放・期間・未加入表示PASS。4報酬内部IDと英語タイトル露出|
|Ranking|PARTIAL|3分類・Daily/Season・自己順位/周辺・未登録・報酬帯PASS。POWER期間欠落|
|Navigation|FAIL|RULE_GUIDE経由でCharacter eligible欠落。装備CTAで停止|
|Tutorial統合|FAIL|Level Up再表示、初期2x、旧Final Guide3枚、Character初回Dialog欠落|
|モバイルUI|PARTIAL|致命的見切れ・重なり・タップ不能の報告なし。実iPhone Safari未検証|

## 修正責任と範囲
1. Tutorial受入済みソース差分の回収と統合。新しいTutorialを設計しない。
2. 実際のCOMPLETE遷移とCharacter初回Dialogを整合。進行停止ユーザーの復帰は実績を捏造しない。
3. 追加判断Authorityに沿いGuild接触を案内、限定Missionの自動訴求を後置。Raid非開催時も実参加達成扱いにしない。
4. Mission名称の表示修正。報酬の種類・数量を変えない。
5. SSR Activityを非表示。過去履歴は削除しない。
6. POWER期間を実データに沿って表示。次期期間・報酬確定・延長を勝手に実施しない。

## 再監査の残り
修正した箇所の再検証に加え、前回未検証のMissionイベント切替・終了履歴・未開催、Ranking通信失敗、Raid未開催からGuild/Mission案内・開催後再案内、World Introduction非SKIPを確認する。
Fresh Userと既存停止ユーザーの双方で確認。Questは接続変更の回帰範囲だけとし、全体再監査を繰り返さない。
挙動・UI・Customer Journey／Game Cycle／Motivation Cycleを区別して結果を記録する。ユーザーの実機確認は最後に全ページ一括。Production変更は別途明示承認後。

## 状態
修正統合・型・ビルド・対象DB検証完了。再配信と実画面再監査待ち。コード検証やDBテストのみで実画面AcceptanceをPASSに置き換えない。

## 実施結果
- Tutorial復元元：`3294bf5a91ae36c964d341f1a1abaf2a6a41165b` (`codex/tutorial-pending-preview-20260911`)。Tutorial関連のみを取り込み、SSR再表示・旧Mission等を丸ごと戻すmergeは行わない。GameContextは該当3箇所のみ。
- Level Up省略、新Final Guide、初期速度1x、World Introduction、編成→装備/スキル同期を復元。画像も同一blobを使用。
- Mission報酬名は共通canonicalItemNameを再利用。報酬内容・個数は不変。
- Guildページ接触はpost_tutorial_guild_viewとして記録。加入や実参加は記録しない。限定Missionの自動訴求はactivation_mission_handoff後へ移動。
- Guide補修はPreview46件、残対象0。初回Dialog対象のみ復帰し、獲得/育成/参加実績は作成しない。
- 認証済みCOMPLETEでQuest記録が止まる条件も除去。匿名/認証済みを同じ完了条件で扱う。
- SSR Activity生成停止・配信除外をPreview適用。履歴110件保持。元のactor表示条件・QA除外・24h・他Activityを保持。
- POWER期間表示は実在ACTIVE行を返す。実際の終了時刻と「集計期間終了・状態確認中」を表示する候補。次期期間設定・報酬配布は行っていない。

## 今回適用済みPreview Migration
- `20260912164556_ranking_power_period_context.sql`
- `20260912164642_hide_ssr_activity_preserve_history.sql`
- `20260912164928_post_tutorial_guide_recovery.sql`
実履歴番号にファイル名を同期済み。再適用・一括db pushは禁止。移植時は適用対象の現行定義を別途照合する（Preview定義hash guardあり）。Tutorial復元元の既存6件はPreview適用済み、再適用不要。

## 検証結果
- Next webpack build、TypeScript、21ページ生成：PASS。
- Guide11分岐：PASS（未開催→Guild/Mission、後日Raid再案内含む）。
- Mission期限・受取復帰・イベント優先順位/Guild前提回帰：PASS。
- Mission4報酬名称・日本語用語、SSR除外・他4Activity保持・24h：PASS。
- Ranking期間外ACTIVE/Daily/CLOSED/通信失敗表示の関数テスト：PASS。
- Preview DB実関数：Guide遷移/冪等/匿名・認証済みQuest/未完了除外/Guild接触と参加分離、Ranking3ケース、SSR配信除外と生成停止：PASS。検証fixtureは全ROLLBACK。
- Supabase advisor対象確認：変更対象の指摘はauthenticated向けSECURITY DEFINER公開。自己auth.uid()検証/取得用途として意図した権限。内部Trigger2関数は直接実行権限を除去。対象外の既存指摘は今回拡大修正しない。
- 実画面再監査：未実施。旧PreviewのPASSを新候補へ自動転用しない。

## 未決・次工程
POWERの次期開催期間と終了処理は運営判断が必要。期間表示の修正のみで状態・運営期間の整合が解決したとは扱わない。
24h/48h Feature Coverageの計測照合は別の残項目。今回のGuide修復を計測完了としない。
再配信後、前記の対象再監査を行い、全ページ一括のユーザー実機確認へ接続する。Production/共有alias/環境変数は変更なし。
