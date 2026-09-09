# レイド承認トップ 専用Preview実接続検証 2026-09-09

## 配信

- 配信SHA: `59eea0414855bdadf36c8df4e30ad41ca10fa449`
- 固定URL: https://tribe-neon-snknq827h-kiyoshi-kitamura.vercel.app/
- Deployment: `dpl_EKnd58JJrqVgug23fVCt2gdUCwXx` / READY
- DB: Preview `sufvuqdnqohpfzkwxohq`。Mock=false。
- 比較元の専用Preview: `b7e523b7c4651a8682f5e182733604e5e463316d` / `dpl_9zVwKca7ctj9Bm7rXdC7gir3VGiR`。
- git archiveで指定SHAの追跡ファイルを隔離し、SHA-256照合済みファイルだけを配信。作業中の差分は含めない。
- SQL、Edge、Cron、フラグ変更なし。Production / 共有alias変更なし。全75 aliasの紐付けは配信前後で一致。
- Production参照は `550c02225cbecb6ba6f174ee3fb952bcaae2f6dd` のまま。今回候補を最新本番同期済みとは扱わない。
- Card担当は競合操作なしと回答。確定素材は894bcb6。KPI担当にも範囲を連絡し、同担当のread-only監査とは別工程として実施。後続コードは取り込んでいない。

## 保持確認

b7e523bとの比較で `src/app/context`、`src/hooks`、`src/domain`、`supabase` の変更は0件。初期装備付与、Replay背景の保存情報参照、ack成功後の元レイド帰還・失敗時保持は同一コード。今回は新しい戦闘を発生させず、既存の実戦闘PASSを新配信での再実施PASSには転記しない。

報酬スクロールのCSS・CanonicalDialogは同一。RaidRoomDialogs.tsxは人物アイコンの共通化と挑戦者表記のみ。実画面でも末尾到達と閉じる操作を確認。
初期装備migration `20260909075933_initial_equipment_authority.sql` は既適用履歴 `20260909090055_initial_equipment_authority` を読み取り確認。再投入なし。

## 実認証・UI結果

専用QA normal / rescueを実GoTrue password認証し、得たセッションを隔離ブラウザー内だけに保持。APIのMock・応答差し替えなし。認証値は保存しない。今回はログインフォーム自体の再検証ではない。

|項目|結果|根拠|
|---|---|---|
|参戦中→続きへ|PASS|normalの渋谷513fddeeへ戻り、本人の貢献・参加済み状態を表示|
|救援依頼→救援参加|PASS|rescueがトップの既存Guild救援から513fddeeへ。join_raid_room_rescue_v1 HTTP200、画面は救援参加、集約API membership=rescue|
|今日の強敵→自分で開始|PASS|実日次は渋谷・横浜。横浜を選択→初級確認→作成HTTP200。49d374ae、normalが挑戦者、24時間期限|
|開催中を探す→通常参加|PASS|rescueが一覧から49d374aeを開き参加。register_raid_room_v1 HTTP200、画面は通常参加、membership=member|
|挑戦者表記|PASS|本人は挑戦者：あなた、他人は実QA名。詳細・一覧でも表示|
|共通カード枠・人物素材|PASS|実プロフィールのデッキ、Character一覧・編成で正規カード枠を表示。配信共通素材26点が指定SHAのハッシュと一致|
|レアリティ・属性バッジ|PARTIAL / 表示未確認|8バッジを含む素材のHTTP200・ハッシュ一致。今回の実プロフィール・通常Character画面ではバッジ付き状態を表示しておらず、画面PASSにはしない|
|他プロフィール→DM|PASS|R0909OUTのプロフィールから既存DM画面へ遷移。送信操作なし。自分の公開プロフィールはDMボタン0件|
|プロフィール位置保持・読込完了後|PASS|390×320で参加者一覧scrollTop 136→プロフィール→閉じる→136。390×600の0→0も確認|
|プロフィール読込中に閉じる|FAIL|閉じた後、取得完了でプロフィールが再表示。読込完了後に閉じれば一覧に戻る。下記残件|
|報酬スクロール|PASS|390×600、本文高さ755/表示433、scrollTop322で末尾到達。上下の閉じる操作を利用可能|

参加テストで最初に待機したRPC名が実装と異なり2回の計測タイムアウトがあった。製品の参加要求は1回ずつ成功しており、再送していない。実際のRPC名・HTTP200・画面・集約APIのmembershipを読み返して判定した。

## 残件

- プロフィールの読込中クローズ: `GameContext.fetchPlayerDetail` が取得後にactivePlayerDetailを再設定する既存経路。今回は指定SHA配信・検証のため修正や追加配信なし。`normal-profile-scrolled.png`（読込中）→`normal-profile-return-diagnostic.png`（閉じた後の再表示）。読み込み世代またはキャンセル判定の修正を別工程で検討する。
- バッジを表示する実導線の追加確認。素材配信確認と実画面確認を分ける。
- 人の端末で390px、低高さ、Safari safe area、横送り、タップ領域、プロフィール・DMの閉じる操作を確認する。ブラウザー自動操作と画像目視は物理端末の受入ではない。
- 前工程の新Freshのメール確認後の通常再ログインは、今回新しい証跡なし。未確認を維持。既存403ユーザーの救済・backfillは未実施。
- 自然討伐はバランス観測待ち。HP短縮fixtureによる既存討伐処理PASSとは別。

## 自然失効の更新

保護対象Room `3972a461-b45f-4b02-8142-75f294461ae3`、boss `56d721b3-8f38-4ac4-939f-9d9ea3760c5d` を読み取り確認。
期限2026-09-09 19:40:55.031663 JST、実状態EXPIRED / TIMEOUT_FAILURE、終了確定19:41:00.160351 JST、HP32,000,000/32,000,000。
Cron13の19:41実行成功時刻とも一致。対象状態・期限・確定時刻の証跡が得られたため、自然失効はPASSへ更新。手動finalize、期限変更、HP変更、Cron実行はしていない。

## 実機確認対象

|対象|レイド|挑戦者・利用法|期限JST|
|---|---|---|---|
|渋谷 初級 ハイスピード・スターズ|`513fddee-eac1-481b-8b2b-8d273131bbef`|R0908N01。normalは続きへ、R0908R01は救援参加済み。既存救援104bd824-6f72-4403-8cca-86188a2d7f24はGuild限定|9/10 16:05|
|横浜 初級 ブルー・レクイエム|`49d374ae-1aeb-4a0b-b95d-0ecda3d3fbd2`|今回normalが日次から作成。R0908R01は一覧から通常参加済み。本人以外の参加者プロフィール・DM確認にも利用可能|9/10 20:59|

新規作成は上記1件、参加登録は救援・通常各1件。戦闘開始・HP短縮・報酬受取・DM送信はなし。既存保護Replay・他レイドの戦闘状態は操作していない。

## 証跡

`evidence/raid-approved-live-20260909/` に配信前後の読み返し、素材ハッシュ、実HTTP、作成・参加資格、プロフィール位置、画面、自然失効を保存。
主要画像: normal-top-390.png / normal-top-lower-390.png / normal-other-profile.png / normal-dm-open.png / normal-reward-bottom.png。
Vercel build READY、配信HTML・15scriptがHTTP200、Preview接続先一致。今回は製品コード変更なし。既存の型・回帰PASS件数は再実行した結果として掲載しない。
