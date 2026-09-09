# Raid / Character 固定SHA統合契約

Raid: 9fe5909c024f649c47ec8402409936cd79fd1a37
Character: a02754c98c1d927e36ecdb46d7ac55541828a346
共通祖先: afb0ca4fd3d2bec5216fa98e5e2ff3a12dec3e90
Branch: codex/raid-character-integration-20260909

この組合せだけを統合する。最新本番同期を意味しない。親が固定SHAの3-way mergeを開始し、A/Bは自領域の採用差分と依存をレビュー・検証する。後続差分は取り込まない。

- A専有: components/character/* と Character Home検証、A報告。育成・編成・総合力・Tutorial分岐を保持。
- B専有: SetupView.tsx/.css、components/gacha/*、context/hooks/useGacha.ts、utils/acquisitionAttribution*、ガチャQAハーネス。Setup/Gacha関連テストとB報告。表示と依存だけ。
- C専有: 統合用tests/scripts/evidence、raid-detail captureの統合検証拡張、C報告。Fresh User Journey、375/390/430と短画面、双方の関連回帰。製品ファイルの修正は担当へ依頼。
- 親専有: GameContext、CommonModals、OutlawButton、台詞2ファイル、フォントREADME/資産、共通docs、git操作、SQL検証、最終型/lint/build。既存Raid製品ファイルは保持。

共有契約: ガチャcategoryとRaid return targetを併存。OutlawButton loadingLabel空文字は文字なし、未指定時は既存fallback。プロフィールは既存PublicUserProfileへ非重畳切替・戻り位置復元。報酬予定/Presentの分離と通常受取を保持。

子commitなし。push/Deploy/外部DB/Edge/Cron/フラグ/alias変更禁止。local Mockと実HTTP認証は区別。旧PASSの転記禁止。devは親が共通port3015で管理、CとBは同じサーバーへ接続。全体buildは親のみ。Supabase追加SQL予定なし。
