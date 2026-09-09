# RAID STEP6
基準2d2d2b1563e92f1471f9c86fa8a7cc59040ec726、Preview sufvuqdnqohpfzkwxohqのみ。
親: 共有変更枠確認、SQL4本適用、Vercel固定候補の専用配信、証跡commit。Production/main/共有alias変更禁止。
A: DB read-only preflightと固定4SQL guard/rollback/postflight準備。適用は親だけ。
B: Vercel read-only現配信/環境/Edge照合と専用配信script準備。配信は親だけ。
C: 専用QA3役/Fresh実HTTP・browser準備と後続検証。QA専用データ以外を変更しない。親通知までHTTP変更操作しない。
全員 .agents/AGENTS.md → release_board.md → 担当task → raid_step5_preview_plan.md の順で読む。資格情報値をログ/報告/commitへ含めない。外部DB適用・配信は親へ一本化。自然失効Room/通常master/他Room/条件保持。
