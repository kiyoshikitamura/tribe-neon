# b7e523b 専用Preview反映・実接続検証

2026-09-09。反映完了、メール確認を伴う通常再ログインは未確認。実Fresh全体のPASSではない。

## 対象と照合

- 配信source: `b7e523b7c4651a8682f5e182733604e5e463316d`。専用branch `codex/raid-fixes-preview-live-20260909`。git archiveの固定sourceから配信し、後続sourceを混入していない。
- 固定URL: https://tribe-neon-p6x8qj0od-kiyoshi-kitamura.vercel.app
- deployment: `dpl_9zVwKca7ctj9Bm7rXdC7gir3VGiR`、READY、target=null、alias=[]。配信JSの接続先 `sufvuqdnqohpfzkwxohq`、Mock=false。HTML/15 scriptすべてHTTP200。
- 共有alias75件は前後同一。Production参照 `550c02225cbecb6ba6f174ee3fb952bcaae2f6dd` / `dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx` を保持。本番同期済みの主張ではない。
- Character担当から HEAD `91f7a7d937fbbf427bfbaada0547f38c244e9a11`、同等initializer/RPC/table修正なし、外部変更予定なしの回答。仮装備表示修正とは別件。取り込みなし。
- KPIへ共有変更枠を連絡。明示回答は得られず、最新完了作業がread-only監査、idleであることを確認。独占ロック取得とは扱わない。
- A/B/C子担当は準備後に使用量上限で停止。実適用、配信、実QA、統合は親が引き継いだ。

## migration

`supabase/migrations/20260909075933_initial_equipment_authority.sql`

SHA-256 (Git/LF bytes): `b96719320722af8bdf18758891a078b942bcc930c91a7dc00fca011738b26125`

適用条件: public/private RPCとreceipt tableが未存在、既存initializerの定義MD5が `6e5b13312b51d1f956fed288b72ea106` と一致。適用トランザクション内でも再検査した。MCP実適用履歴は `20260909090055_initial_equipment_authority`。ローカルファイルtimestampとの違いは適用サービスによる履歴採番であり、別SQLではない。

順序: 前提照合 → migration 1本 → 別接続で定義/権限/台帳/既存装備確認 → 対応フロント → 実HTTP。旧Raid SQL再投入なし。Edge変更不要、現行保持。Cron/フラグ/共有alias変更なし。

適用直後は既存装備20件と集合ハッシュが不変、台帳0件。authenticatedは本人no-arg RPC実行のみ、anon実行不可、汎用装備INSERT権限なし。private台帳はRLS・直接アクセス不可。Advisorの新規対象はINFO「private台帳にpolicyなし」のみで意図した状態。

初期化の新規ユーザー分岐だけPENDING登録。正規tutorialガチャ完了後、固定5種を最初の所有キャラに付与しGRANTED。同じreceiptを再利用する。既存ユーザーへの後付け資格なし。復旧が必要な場合は既存のローカル修正C計画に従って停止・差分照合し、付与済み装備/台帳を削除しない。本記録は自動再適用・巻戻しを指示しない。

## 実HTTP結果

| 項目 | 結果 | 証拠/境界 |
|---|---|---|
| 初期装備保存403 | PASS | 新QA `216907d1-92e3-4ba8-bafd-953bbd51faec`、通常Setup→無料10連後にRPC200、DB5件・GRANTED。装備INSERT403なし |
| DB/表示/総合力 | PASS | ロン(char_long_01)の武器1・頭・胴・脚・アクセ1、5/7枠。DBと一致。チーム総合力UI/APIとも87,341 |
| 本人RPC再試行 | PASS | 同じ5 UUID、追加付与なし |
| 再読込 | PASS（匿名） | 同UID・同5 UUID・総合力87,341。通常メール再ログインの代用にしない |
| 実Fresh | 部分PASS/未完了 | Setup→ガチャ→スキル→Lv7育成→編成→クエスト→無料時短→実戦勝利→案内→ホーム。メール確認送信済み、未確認・通常再ログイン待ち |
| 既存403 QA | PASS（非付与） | 既存確認対象3名は装備0/receiptなし。救済未実施 |
| 総合力不足 | PASS | 実create拒否403/42501 `raid power requirement` に必要160,000・現在78,228。条件変更なし |
| 新規出撃/再送 | PASS | 既存QA Room `513fddee-eac1-481b-8b2b-8d273131bbef`、実UI出撃、RP4→3。同要求再送は同Replay、追加消費なし |
| Replay再読込/ack帰還 | PASS | Replay `f316a06b-b0a0-41b5-b12a-78db1561a0dc`。startは1回、同Replay復帰、ack後に元レイド帰還。RP3保持 |
| 背景 | PASS（機械操作＋エージェント目視） | 通常Result/再読込Resultとも渋谷の同背景。390x844画像を比較 |
| 人による実機受入 | 未確認 | Safari/Androidで操作、低高さスクロール、タップ、背景遷移を最終確認する |

新QAは初期化直後に既存KPI契約でqa分類し、通常マスター・HP・報酬条件・所属を管理者操作で変更していない。初回クエストの通常無料時短のみ利用。

実HTTPには初期化前の補助RPC 409/400/500、空行の406、旧battle_sessions/newsへの404が観測された。装備403とは分離し、`fresh-http-summary.json`に集約。無視してHTTP全体PASSにしていない。今回の経路はホームまで到達したが、これらの既存/新規分類と整理は残件。

09:04 UTCに別ユーザーの装備10件追加を観測。今回のreceiptはなく、今回の5件初回付与による追加ではない。管理範囲外データを削除/修正せず、環境全体不変とは主張しない。既存403の指定QA3名の非付与は別途確認した。

## 証跡と残件

`evidence/raid-fixes-live/` に配信、migration、実HTTP、RP/Replay、装備、画面を保存。ナイフ枠が空だった初期撮影は画像decode前。decode完了後の `b-equipment-slots-loaded.png` で5枠を確認し、製品不具合とは判定していない。自動テスト初回の出撃準備画像scope不一致は出撃前に停止。正しいbody scopeに修正し、1回の実出撃を実施した。

自然失効: 保持対象Room `3972a461-b45f-4b02-8142-75f294461ae3` / boss `56d721b3-8f38-4ac4-939f-9d9ea3760c5d`。18:22 JST読取ではACTIVE、HP32,000,000、outcome/finalizedなし。期限19:40:55 JST前なので未確認。期限後の実状態・終了時刻を確認するまでPASSにしない。Cron成功のみで判定しない。

自然討伐はバランス観測待ち。今回のレイド戦闘は個人敗北・レイド開催中。以前のHP短縮fixtureによる討伐処理確認を自然討伐へ転記しない。

未完了: メール確認、通常パスワード再ログイン/再ログイン後の重複なし、実Fresh全体判定、人の実機受入、期限後の自然失効。既存403ユーザー救済は未実施。Production変更、main統合、git pushは行っていない。
