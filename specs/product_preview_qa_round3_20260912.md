# 統合Preview受入 Round 3：接続Blocker修正

## 受領した監査
ユーザー共有の実画面監査。対象 `63a2adf1725fcf4d13336def1101307210a56c7b`、https://tribe-neon-6vcge47ff-kiyoshi-kitamura.vercel.app 、Preview Supabase `sufvuqdnqohpfzkwxohq`。
配信READY。匿名Fresh QA「統合QA2」、KPI qa除外。親側による同一実画面監査の実施を意味しない。

## 継承する受入証拠
Fresh Tutorial、World Introduction非SKIP、3Skill装備、初期1x、新Final Guide表示、Character初回設定、Quest通常サイクル、PvP実戦、Raid未開催表示、Guild単独画面、Mission受取・名称、Ranking3分類×2期間、Leader変更・Reload保持は実画面PASS。
Tutorial完了/初回MyPage到達等のKPI記録を確認。SSRは関数定義による除外と履歴110件保持を確認（QAのActivityは空表示）。

## 今回のP0
1. Final Guide完了のサーバーAuthorityを確認した後にHomeへ明示的に遷移する。失敗時に先へ進めず、再試行で保存済み完了を回復可能にする。
2. Raidページと同じ公開モードで開催状況を取得し、MyPage/Missionへ反映する。ROOM_UI_ENABLED未指定を取得未実施としない。成功した空一覧は未開催、通信失敗/不正応答はunknown。環境変数を変更して解決しない。
3. Guild接触→Mission接続、後日Raid再案内と実参加未達を保持。旧仕様assertは現在Authorityに合わせて更新する。

## 別管理の指摘
- Tutorial実回復958に対しBattle Resultの回復0。戦闘結果集計の表示差として未解消。
- Quest戦闘準備83,842とMain Formation/Header/Ranking89,732。計算Authority・編成・snapshot時点の照合が必要。未解消。
- Character設定完了Feedback：コード/DBあり、実画面記録未捕捉。再監査時に確認。
- POWER次期開催期間・終了処理：運営未決を継続。

## 再監査範囲
まず2件の実接続を確認。既存PASSは関連する画面間接続の回帰に絞り、全Repository/全Tutorialの再監査を繰り返さない。
前回未検証のイベント切替/終了履歴/未開催、Ranking通信失敗、Raid開催後再案内、認証済みユーザー通しは、再現可能な条件があるものを実施し、条件不足は未検証と明示。
UI/挙動/Cycle整合を分ける。実iPhone Safariを含むユーザーの一括実機確認は、接続Blocker修正後の再監査を経て行う。

## 実施状態
コード修正完了、再配信・実画面再監査待ち。
- Final Guide：完了Authority確認後にHomeとonboarding表示を切替。保存応答消失後の再試行、二重タップ防止、StrictMode復帰を含む。
- Home/Mission：同一hookでRaid公開モードを選択。通常モードはget_active_raids、Roomモードは既存Room一覧を確認。取得失敗を未開催へ変換しない。
- DB Migration追加なし、環境変数変更なし、Production/共有alias変更なし。

## 修正検証
- Next webpack build / TypeScript / 21ページ生成：PASS。
- verify_tutorial_final_home_handoff.mjs：PASS。実TSXのCTAを実行し、匿名/認証済み・連打・StrictMode・Authority不成立・通信失敗・保存済み再試行を確認。
- verify_raid_guide_availability.mjs：PASS。通常/Room公開モード、空一覧、エラー、不正・不完全応答、期限切れ、Guild→Mission、開催後案内、参加未達を確認。
- verify_game03_daily_cta_activity.mjs：現在Authorityへ更新しPASS。Daily報酬/回数/リセット/受取契約の既存検証を維持。
- Preview既存「統合QA2」でacknowledge_initial_raid_guide→complete_activation_mission_handoffと両再送を実行：PASS。first_raid不変。全ROLLBACKでQAの進捗に永続変更なし。
- 旧verify_game03_short_tutorial_character_setup.mjsはmock全体がWorld/Quest省略等の旧フローを持つため、今回のPASS対象に含めず別管理。単にassertだけを緩めて正常化しない。
- 実ブラウザでの2件再受入は未実施。新候補をWindows環境から再配信して確認する。
