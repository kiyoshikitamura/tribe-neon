# Raid Room PC 実行記録

2026-09-08 / STATUS: IN_PROGRESS（工程1記録済み、工程2準備、実適用待ち）

## 今回の結果

コード/実配信SHA: `375a0ad642a81e9db10a9379f03e5e5f77fb4562`。Preview ref: `sufvuqdnqohpfzkwxohq`。配信URL: https://tribe-neon-705g1hvhg-kiyoshi-kitamura.vercel.app/ 。Edge v6。適用migration/設定版: **今回なし**。

|検証|実行日時JST|結果|
|---|---|---|
|GitHub PR / git checkout / release_board照合|2026-09-08 17:19〜17:22|PASS。第20工程までと第21工程未統合を区別|
|既存Supabase/Vercel/Auth管理読取|17:20〜17:26|PASS。実DBへREAD ONLY、UIから既存配信/設定を照合|
|DB catalog・履歴・主要関数・Cron|17:21〜17:26|取得成功。275履歴、6 job、最新20実行succeeded。Room実装未適用|
|固定URL HTTP / JS|17:26|HTML200、JS14/14が200、Preview refを含む。認証済みゲーム操作の検証ではない|
|node --test tests/raid-room/preview-config.test.mjs|17:24|11 PASS / 0 FAIL。オフライン生成の既存検証|
|実DB/Edge経由のRoom作成→両Present受取|未実行|Room migration・新Edge・UI flag・報酬設定・テスト担当が未成立|
|複数接続競合 / Room実Cron / 実機|未実行|機械検証・管理画面の読取で代替しない|

詳細と未確認項目は [preflight](raid_room_pc_preflight.md)。証跡は `evidence/raid-room-pc-20260908/`。DB更新、Edge deploy、Vercel deploy、環境変数変更、フラグ変更、alias移動なし。復旧操作不要（読み取りのみ）。将来Roomが稼働した後は旧Edge v6への単純rollbackは不可。切替手順の停止・既存receipt/Present保持・前進修正に従う。

## 実機用暫定設定案（親レビュー用・未承認・未投入）

バランス確定案ではなく、両報酬の疎通確認用。projectRefは今回実接続を確認したPreview。設定版候補1は実設定表未存在のため、適用時に再照合する。品目ID `CHAR_EXP_S` / `EQUIP_EXP_S` は実Previewマスター18件中に存在し、有効であることを確認した。数量1はPCが提案する試験値。

|難度|救援必要戦数|救援Damage以上|討伐Damage超過|救援品目/数量|討伐品目/数量|
|---|---|---|---|---|---|
|beginner|2|16,000|0|CHAR_EXP_S ×1|EQUIP_EXP_S ×1|
|intermediate|2|68,000|0|CHAR_EXP_S ×1|EQUIP_EXP_S ×1|
|advanced|3|205,000|0|CHAR_EXP_S ×1|EQUIP_EXP_S ×1|
|expert|4|290,000|0|CHAR_EXP_S ×1|EQUIP_EXP_S ×1|

救援候補は `specs/raid_room_rescue_v1.md` の未確定候補を引用。討伐0はPCの疎通用提案で、ACTIVE中に正の確定貢献＋撃破を確認するための値。正式な閾値・ゲームバランスを決めたものではない。閾値一致/超過の境界試験には親が確認した試験条件を別途用意する。生成templateは変更せず、COMMIT版SQLは作っていない。両報酬設定は未投入で、これを実機提供完了としない。

## 親へ返す残件

- 第21工程統合後の採用SHAと残るCI失敗の影響。
- KPI作業と共用しているPreviewの担当・変更競合確認。
- 履歴欠落/別工程migrationの実定義互換比較、必要SQL・DB/Edge/UI対応と復旧版の確定。
- 使用許可のある主催者/通常参加者/救援参加者、およびGuild（実DB現状0）。資格情報は記録しない。
- 暫定設定の親レビュー、実Preview一連検証・実Cron・競合・実機受入。

Repository記録のみを全体開発完了と通知しない。親による根拠レビュー前にrelease_boardを更新しない。
