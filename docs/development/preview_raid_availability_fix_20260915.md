# Previewレイド未開催表示の修正（2026-09-15）

対象: codex/formal-open-integration-preview-20260914 / Supabase sufvuqdnqohpfzkwxohq。

調査: RAID機能OPEN、Room新規作成/戦闘enabled=true、legacy=false。当日2026-09-15の対象は池袋/六本木。日付のハードコードは見つからず、旧画面のget_active_raids空応答が「現在開催中のレイドはありません／次の開催情報が確定すると、ここに表示されます。」になる経路を確認。元Deploymentのフラグ値自体は未取得。

修正: next.config.tsで、指定Preview branch・VERCEL_ENV=preview・指定Preview DB URLが一致する場合だけNEXT_PUBLIC_RAID_ROOM_UI_ENABLED=trueをビルドへ渡す。現行RaidTab、GameContext、Homeの開催判定を同じRoom APIへ接続。Productionと他branchは従来設定を保持。公開config診断へraidRoomUiEnabledを追加し、配信後に実効値を確認可能にする。

確認: 対象Preview/Production/別branch/development/別DB/旧falseの6条件を評価PASS。ローカル実行環境が利用不可のためローカル型/build未実施。Git連携Vercel buildと配信診断で続けて確認する。ログイン後の本人端末受入は別途。

DBは読取のみ。既存Raid・HP・日次対象・報酬・Cron・Migration・Production変更なし。旧APIを再有効化しない。

## 配信後確認

修正コードSHA: 607352a7c708f9265fec05c5a55d53dc0ef0c0b1
固定URL: https://tribe-neon-m7ouq6iqs-kiyoshi-kitamura.vercel.app/
Deployment: dpl_CiuvhZNF8u393ECmgqRDm6vcx4oC / READY / source=git / target=null。
GitHub tribe-neon status success。Vercel補助get_deploymentは今回は成功（403継続を前提にしない）。公開configのHTTP200で同SHA、raidRoomUiEnabled=true、preview_database=trueを確認。固定URLをBrowserで開いて起動表示を確認。本人QAログイン後のRaid実操作は未確認。

DB読取トランザクションでget_raid_top_v1 dailyTargets.status=ready、池袋/六本木の当日対象を確認。旧RPCとの同時読取はFOR SHAREがread onlyで拒否されたため中断し、TOPだけの読取で確認し直した。永続DB変更なし。

旧固定URL31b1cccは更新されないため実機受入には上記新固定URLを使用する。課金環境不足とPvP実競合未実施は別残件として保持。
