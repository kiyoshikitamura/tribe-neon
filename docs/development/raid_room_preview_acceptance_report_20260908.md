# Raid Preview 討伐・報酬受取確認 2026-09-08

専用QA RoomのHP調整後、正規戦闘で討伐し、救援・討伐Present計4件を通常画面から受け取った。救援ユーザーの両Presentの再受取拒否、最終Replay再送による重複反映なし、正の討伐閾値の未満・一致・超過を確認済み。前報告の討伐・両Present・文言改善の残件を解消した。24時間失効は別Roomで翌日継続する。

## 接続・配信・変更枠

| 項目 | 確認値 |
|---|---|
| Preview DB | `sufvuqdnqohpfzkwxohq` |
| Raid基準 | `375a0ad642a81e9db10a9379f03e5e5f77fb4562` |
| 今回のUI配信SHA | `feeca750e4c07e66c7607cfbb0290c3370a1aae8` |
| 専用固定URL | https://tribe-neon-ptcsb3j03-kiyoshi-kitamura.vercel.app |
| Deployment | `dpl_De7RHzqA292BLdcFFN7fkZCeofQt` / READY / aliasなし |
| Edge | `resolve-battle` v7 / ACTIVE / verify_jwt=true |
| Edge bundle SHA256 | `b762e7c25826f9a417c87cf550388e291f2c75d0e278599e6a1d3dcd70fd8b21` |

KPI側・演出PC側へ変更枠を再照会し、Previewのmigration・Edge・設定・共有alias変更を重ねない旨を確認した。20:15頃から60分の予約内で実施し、完了後にKPI側・演出親側・演出PC側へ解放連絡した。時刻・宛先は `coordination.json`。KPI/演出/Raidの既知共有alias 9件は従前と一致。今回のdeploymentにはaliasを付けていない。

演出側から別工程の製品UI SHA `59be3c715defa33c61adbfb0e84f16778f34525d` の連絡を受けた。今回のRaid配信には取り込んでおらず、統合済み最終配信SHAとして扱わない。当方の操作で本番変更・pushは行っていない。

Deployment metadataのgitDirty=1は未commit証跡・outputsによるもの。製品ソースはfeeca750でcommit済みで、証跡とoutputsは配信対象外。配信後の製品コード変更はない。

## QA限定HP調整と正規討伐

Room `af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3`、boss instance `c127f1da-9a60-4919-b351-6a99412574d7`。参加者は主催者R0908H01・通常R0908N01・救援R0908R01の専用3名だけ。GuildはR0908Guild01 (`d42ae136-03b9-4591-b5c4-ede0ab9c2e50`)。既存19名を流用していない。

| 時点 | current_hp | max_hp | 状態 |
|---|---:|---:|---|
| 変更前 | 31,988,539 | 32,000,000 | ACTIVE |
| QA調整直後 | 25,000 | 32,000,000 | ACTIVE |
| 正規最終戦後 | 0 | 32,000,000 | CLEARED / DEFEAT_SUCCESS |

救援ユーザーの既存貢献3,117に対し、救援条件は2戦以上・16,000以上・討伐成功。追加戦闘で条件を満たしてから他2名が討伐できる余地を残すため、残HPを25,000にした。最大HP・敵戦闘snapshotの強さ・通常マスター・報酬条件は変更していない。

実行原文は `evidence/raid-room-acceptance-20260908/qa-hp-apply.sql`。boss行ロック、期待HP/状態、Room/owner、参加者3名、未確定Replayなしを確認し、current_hpの1行だけを更新した。他boss全行ハッシュを同一transaction内で前後比較した。貢献・討伐状態・報酬台帳は直接更新していない。

変更ID `raid-preview-qa-hp-acceptance-v1` とpayload SHA256 `c675c4cdea6507bbf0a4b0530063ce8d09b5f76e375b0f5ef13c1d29f0ee3526` を同じtransactionで記録。ファイル全体SHA256は `7045bc8b4239e33e21d81f6abce3cdd14543cfc64867d2717b15597783c535be`。二つのハッシュは対象範囲が異なる。SQLはUTF-8・BOMなし・LF、重複ID拒否付き。適用済みなので再実行しない。

追加8戦は認証済み専用ユーザーが `start_raid_room_battle_v1` → Edge `resolve-battle` を正規に実行した。

| 順 | 役割 | raw damage | 共有HP反映 | 残HP | 個人累計 |
|---|---|---:|---:|---:|---:|
| 1 | 救援 | 3,113 | 3,113 | 21,887 | 6,230 |
| 2 | 救援 | 3,118 | 3,118 | 18,769 | 9,348 |
| 3 | 救援 | 3,160 | 3,160 | 15,609 | 12,508 |
| 4 | 救援 | 2,417 | 2,417 | 13,192 | 14,925 |
| 5 | 救援 | 3,590 | 3,590 | 9,602 | 18,515 |
| 6 | 主催者 | 3,664 | 3,664 | 5,938 | 7,323 |
| 7 | 通常 | 4,677 | 4,677 | 1,261 | 9,362 |
| 8 | 通常 | 4,370 | 1,261 | 0 | 13,732 |

救援は合計6戦・18,515貢献。討伐確定は20:17:58.643622 JST、Replay `6883af2a-b132-4e5e-b7b5-59ae53437eb4`。最終戦の共有HP反映は残HP1,261で上限になるが、個人貢献にはraw damage 4,370が入る。初回3戦と今回8戦の計11件。後から結果を作るSQLは実行していない。

## Present発行・通常画面の受取・再送

| 受取者 | 種類 / アイテム | Present ID | 結果 |
|---|---|---|---|
| 主催者 | 討伐 / EQUIP_EXP_S ×1 | `80a388c3-9f08-4846-be20-8ad188b34e67` | 通常UI受取、CLAIMED |
| 通常 | 討伐 / EQUIP_EXP_S ×1 | `9fb78226-c94c-4c45-b976-b9c7d2545918` | 通常UI受取、CLAIMED |
| 救援 | 討伐 / EQUIP_EXP_S ×1 | `f853a17a-8050-451a-8a31-a4843c073a36` | 通常UI受取、CLAIMED |
| 救援 | 救援成功 / CHAR_EXP_S ×1 | `6652eb9b-4264-4792-9c83-be025e6e27eb` | 通常UI受取、CLAIMED |

Playwrightの実ブラウザーで専用URLに各ユーザーとして入り、MENU→プレゼント→対象行「受け取る」を操作した。一括受取は使っていない。HTTP200/successとDBのclaimed_atを照合し、受取ダイアログ・画面を保存した。救援は再読込後に両Raid Presentが未受取一覧から消えることも確認した。

救援の所持数は両アイテムとも0→1。同一Present IDを認証済みRPCで再送すると両件ともP0001 `Present is not claimable`。その前後で所持数・Present行が完全一致した。討伐確定Replayを再送してもboss全行・ダメージ11行・Present4行が一致し、追加付与なし。証跡は `duplicate-claims.json`・`cleared-replay-state-comparison.json`。

通常UI復帰も3役で確認し、11件の開始要求すべてのrecovery_acknowledged_atが設定された。救援の初回自動操作ではack応答を待たず再読込し、同じReplayを複数回表示した。自動操作を応答・画面遷移待ちへ修正し、DBで確認済み状態を照合した。再確定による追加貢献はない。

初回受取テストは救援Presentの表示名を誤って指定し、送信前にtimeout。次の試行は救援受取成功後、データ同期中の受信箱「閉じる」を早く押してtimeoutした。DBのCLAIMEDと成功応答を照合してから、未受取の討伐Presentだけを続行した。結果不明の受取を盲目的に再送していない。これらの失敗証跡も残した。

## 文言・回帰・正の討伐閾値

新規作成がDBの明確な停止エラー（55000 / room creation disabled）なら「レイドの新規作成は現在停止中です。再開後にお試しください。」と表示する。満員やネットワークエラーを停止扱いしない。Room戦闘停止表示も開催状態・運用再開を確認できる文言へ改善した。

戦闘Resultは「討伐・救援報酬はRoomの『報酬』で確認できます。条件達成時はプレゼントBOXへ届きます。」へ変更。配信後の実Replay結果で表示を確認。今回、共有DBフラグを再度無効化する変更は行わず、停止文言は自動テストで検証した。

| 検証 | 結果 |
|---|---|
| 型・build | PASS |
| Room契約 | 110 PASS |
| UI回帰 | 74 PASS（activity14 / browser29 / clear4 / ranking5 / cutover3 / useBattle19） |
| 既存戦闘 | canonical runtime・full skill load・支援スキル選択を含むAI監査・演出契約・MVPの5スクリプトPASS |
| 実UI | 3役の復帰、Present4件受取、救援の受取後再読込PASS |
| 重複 | 両Present再受取拒否、最終Replay再送不変PASS |

正の討伐閾値は、実DBの関数定義2本と確定済みQA戦闘データを読み取り、PGlite 0.5.8のローカルDBへ複製して検証した。関数定義ハッシュは実DBと一致。実DBの通常報酬マスター（厳密に0超）は変更していない。

| ケース | 実貢献 | ローカル正閾値 | 判定 | Present/台帳 | 発行再試行 |
|---|---:|---:|---|---|---|
| 未満 | 18,515 | 18,516 | not_succeeded | 0 / 0 | 0件 |
| 一致 | 18,515 | 18,515 | not_succeeded | 0 / 0 | 0件 |
| 超過 | 18,515 | 18,514 | succeeded | 1 / 1 | 0件追加 |

3ケースともPASS、各transactionはROLLBACK。最小fixtureでの判定・発行検証であり、実DB閾値を変更した試験やRLS/並行実行試験とは区別する。実ユーザーによる受取・再受取は上記Previewで確認済み。

## 保持確認・今後の統合・残件

既存Cron6件は定義一致、期限Cron job13は保持。migration履歴275件、保護対象共用関数378件の本文ハッシュ不一致0件。既存19ユーザーの全行ハッシュは `b868375386785c9dfdad599129f9005f` のまま。旧Raid開始false、Room作成・戦闘・救援true、両報酬有効を維持。適用済み14本は再投入していない。

24時間失効Room `3972a461-b45f-4b02-8142-75f294461ae3` はRoom・bossの全行が変更前と一致し、ACTIVE / HP32,000,000 / outcomeなし。期限は **2026-09-09 19:40:55.031663 JST**。監視 `raid-preview-24` は翌19:45に読み取り確認する。期限前のため失効成功には数えない。

後続バトルUI統合では次を保持する。

1. `251dc03` の確定済みRoom再生と、Resultを戻る際のack。旧battle_sessions不在時も動作し、ack失敗時はResultと復帰情報を残す。ユーザー切替ガードを削除しない。
2. `feeca750` の停止判別・報酬案内。現在のuseBattle.tsは251dc03と比較して報酬文言1行だけが異なり、復帰ロジックは一致する。
3. 演出側 `59be3c7` とKPIの採用差分を別途照合し、競合解消後の新SHAを記録する。Room回帰・useBattle19件・支援スキル選択・実UI復帰を新SHAで再実行する。今回の旧戦闘viewerでの成功を、新viewerの統合後成功として流用しない。

通常受信箱には既存のSWRダミーPresent `p_swr` を実接続時にも追加する処理があり、同期後の未受取件数に一時的な増加が見えた。Raid対象IDの発行・受取には影響せず、その行は受け取っていない。`GameContext.tsx` のSWR追加処理として別の共通UI課題に記録する。既存battle_sessions 404互換読み取りも残る。

復旧時も討伐済みQA RoomをHP復元で復活させず、貢献・Present・台帳を保持する。UIだけを戻す必要がある場合は復帰修正済み251dc03の専用配信を候補とし、Edge v7とDB互換性を確認する。運用停止は既存の切替手順で新規開始を止め、台帳削除や14本再適用を復旧手段にしない。今回の調整は正式バランスの確定ではない。

証跡一式: `docs/development/evidence/raid-room-acceptance-20260908/`。秘密情報・ユーザーセッションは含めない。
