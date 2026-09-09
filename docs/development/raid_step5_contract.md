# RAID UI STEP5 固定候補・Preview適用準備
基準49222de05d0d9925beb6439c56c03a61b8564af5、専用branch codex/raid-preview-candidate-step5-20260909。
A: 本番実配信metadata/alias読取、完成済Character後続SHAと検証証拠の確認、共通祖先/差分/初期装備失敗修正の読取。Aは製品共有ファイルを編集しない。
B: Preview現履歴/定義をread-onlyで確認、未適用4SQL hash/依存/旧14本再投入回避、適用と復旧と実HTTP3役手順を文書化。外部SQLはSELECT/readonly transactionのみ。資格情報の値は記録しない。
C: 回帰対象/fixture/影響画面を準備、親統合後に型以外の回帰とMock Fresh Journeyを実行。実HTTPと分離、181枚再撮影せず影響画面のみ。初期装備保存失敗の検証契約も確認。
親: 本番確認済完全SHAを固定しローカルgit統合、GameContext等共有ファイルと競合を編集、最終型/lint/build、commit、統合報告。子は必要差分を親へ提示し独自commitなし。
共通: .agents/AGENTS.md、release_board.md、codex_parallel_protocol.mdを読む。作業中他系統取り込み禁止。push/Deploy/外部DB適用/Edge/Cron/flag/alias変更なし。読み取り不可は未確認とし独立作業を完成させる。
