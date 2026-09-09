# RAID FIXES LIVE B

対象固定候補: b7e523b7c4651a8682f5e182733604e5e463316d。
状態: 親が実検証を引継ぎ。装備保存/再試行/匿名再読込/ホーム到達PASS、メール確認と通常再ログイン待ち。最新結果は raid_fixes_preview_execution.md を参照。

## 準備

scripts/raid-fixes-live/b-session.mjs: manifest先書き、新actor重複作成禁止、同一memory browserでfilegate継続。token/storageStateを保存しない。HTTP記録はpath/method/status/codeのみ。既存actor流用なし。

`node scripts/raid-fixes-live/b-session.mjs --gate-selftest`: PASS（ローカルのみ）。
`node --check scripts/raid-fixes-live/b-session.mjs`: PASS。

## 正規の再ログイン経路

既存TutorialAuthenticationは匿名からemail連携(updateUser)→確認メール→password設定→finalize。タイトルの既存useAuth.handleEmailLoginはsignInWithPassword。匿名session再注入や単なる再読込は再ログインPASSにしない。

公式docsでも匿名へpassword追加はemail/phone検証先行。利用可能な受信先や確認導線がない場合は実再ログインを未確認として記録し、認証設定/権限を変更しない。

## 実施予定

1. 新Fresh1名を通常UIから開始し、名前初期化まで。userIdをsafe manifestへ保存。
2. 親がKPI QA分類するまで停止。
3. 通常Fresh導線と初期装備5件のHTTP/UI、DB readbackと総合力一致を確認。
4. 本人ensure_initial_equipment_v1の再試行でID集合/件数/装備状態不変を確認。
5. 正規再ログインが実施可能なら実行し同UID/装備/総合力を照合。確認メール待ちなら正確に未完了とする。

参照: https://supabase.com/docs/guides/auth/auth-anonymous.md（2026-09-09 GET 200）。Changelog取得済み、今回の通常匿名/email手順に適用する破壊的変更は確認されず。
