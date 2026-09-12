# Product実画面監査修正：専用Preview再配信・再監査

## 取得
Repository: kiyoshikitamura/tribe-neon
Branch: codex/product-preview-20260912-694db8f
親の最終報告SHAを独立フォルダへfetch/checkoutする。既存Windowsの未共有作業を上書きしない。旧固定Preview 6vcge47ff / SHA63a2adfへの接続Blocker修正候補。

## 配信
既存Vercel CLI認証・Preview設定を使用。
Team: kiyoshi-kitamura / Project: tribe-neon
Project ID: prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb
Supabase: sufvuqdnqohpfzkwxohq
Preview targetのみ。Production、共有alias、環境変数は変更しない。秘密値を表示しない。
固定Preview URL / 配信SHA / Deployment ID / Supabase project ref / READY / HTTPを返す。

## 今回の差分
Final Guide完了後のHome遷移、ROOM_UI_ENABLED未指定時を含むRaid開催判定の共通化。今回は追加Migrationなし。環境変数を追加・変更しない。

## DB
親側で以下をPreview適用・実関数検証済み。再適用しない。一括db push不要。
- 20260912164556_ranking_power_period_context.sql
- 20260912164642_hide_ssr_activity_preserve_history.sql
- 20260912164928_post_tutorial_guide_recovery.sql
前候補の5件とTutorial復元元の6件も適用済み。DB状態を巻き戻さない。

## 再監査
過去の広いチェックリストを最初から再実施せず、以下の優先確認と未検証に絞る。
正：specs/post_tutorial_judgment_authority_20260912.md。
実施済みと今回差分：specs/product_preview_qa_round3_20260912.md。
優先確認は、Final Guide「街へ出る」→手動操作なしでHome、PvP後の未開催判定→Guild→Mission。匿名/認証済み・通信失敗時の誤進行なし・再試行・後日Raid案内を対象にする。前回PASSのTutorial演出/Quest/Mission/Rankingは接続の回帰だけ確認する。
1. Final Guide「街へ出る」からHomeへ自動接続。Login Bonus/無料ガチャ案内を確認。保存応答消失後の再試行と、失敗時に先へ進めないことを確認。
2. 現Previewと同じROOM_UI_ENABLED未指定の状態で、PvP後に未開催判定→Guild接触→Missionへ接続。first_raid未達・未加入を保持。Mission側も「開催待ち」と一致。
3. 開催情報取得失敗を未開催と扱わないこと。開催後の再案内はFactがあれば確認、なければ未検証と明示。
4. Character初回設定の完了Feedbackを重点確認。前回コード/DBでは確認済みだが画面記録未捕捉。
5. 前回未検証：Missionイベント切替・終了履歴・未開催、Ranking通信失敗、認証済みユーザー通し。再現可能な条件のあるものだけ実施し、条件不足は報告する。
前回PASSのTutorial演出/Quest/Mission/Rankingを全面再監査しない。UI・操作・3 Cycle整合を確認し、未検証をPASSへ置き換えない。

QAは現在Windowsブラウザの匿名「統合QA」を再利用可能だが、別Originへセッションは自動移行しない。新Previewで必要なら既存QA運用に沿って専用テストアカウントを用意し、qa除外を維持。秘密値をチャットやRepositoryへ掲載しない。
実画面で確認できない条件は未検証と記載。POWER次期期間設定は運営未決として残し、勝手な期間延長・報酬付与で解決しない。
ユーザーの実機確認は最後に全ページ一括。実iPhone Safariはその際に確認。Production変更は別途明示承認後。
