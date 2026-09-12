# Product実画面監査修正：専用Preview再配信・再監査

## 取得
Repository: kiyoshikitamura/tribe-neon
Branch: codex/product-preview-20260912-694db8f
親の最終報告SHAを独立フォルダへfetch/checkoutする。既存Windowsの未共有作業を上書きしない。旧固定Preview f9lx3ik3d / SHA1a814d7への修正候補。

## 配信
既存Vercel CLI認証・Preview設定を使用。
Team: kiyoshi-kitamura / Project: tribe-neon
Project ID: prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb
Supabase: sufvuqdnqohpfzkwxohq
Preview targetのみ。Production、共有alias、環境変数は変更しない。秘密値を表示しない。
固定Preview URL / 配信SHA / Deployment ID / Supabase project ref / READY / HTTPを返す。

## DB
親側で以下をPreview適用・実関数検証済み。再適用しない。一括db push不要。
- 20260912164556_ranking_power_period_context.sql
- 20260912164642_hide_ssr_activity_preserve_history.sql
- 20260912164928_post_tutorial_guide_recovery.sql
前候補の5件とTutorial復元元の6件も適用済み。DB状態を巻き戻さない。

## 再監査
正：specs/post_tutorial_judgment_authority_20260912.md。
実施済みと今回差分：specs/product_preview_qa_round2_20260912.md。
1. Fresh Tutorial：Level Up省略、初期1x、新Final Guide、World Introduction非SKIP、Character初回Dialog。通常Battle/Questへの戻りも確認。
2. Post-Tutorial：Login Bonus→無料Skill/Equipment→Character→Quest/CASH→PvP→Raid→Guild→Mission。既存停止QAの復帰、匿名/認証済み双方、未開催スキップと開催後再案内。Guild案内は加入強制にしない。
3. 限定Mission自動訴求の後置、認証案内を止めない、通常Missionの自由アクセス。
4. Mission報酬/タイトルの名称、SSR Activity非表示、POWER実期間と状態確認中の表示。
5. 前回未検証：Missionイベント切替・終了履歴・未開催、Ranking通信失敗。
画面操作・モバイル表示・3 Cycle整合を記録する。既存PASSのQuestは変更影響の接続回帰に絞る。

QAは現在Windowsブラウザの匿名「統合QA」を再利用可能だが、別Originへセッションは自動移行しない。新Previewで必要なら既存QA運用に沿って専用テストアカウントを用意し、qa除外を維持。秘密値をチャットやRepositoryへ掲載しない。
実画面で確認できない条件は未検証と記載。POWER次期期間設定は運営未決として残し、勝手な期間延長・報酬付与で解決しない。
ユーザーの実機確認は最後に全ページ一括。実iPhone Safariはその際に確認。Production変更は別途明示承認後。
