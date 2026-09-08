# Raid Preview接続・疎通結果（2026-09-08）

## 現在の配信

- 対象DB: `sufvuqdnqohpfzkwxohq`。本番への変更、push、14 migrationの再投入はしていない。
- Raid照合基準: `375a0ad642a81e9db10a9379f03e5e5f77fb4562`。
- 最終UI SHA: `251dc03fcd9a1dcf9c9f871ff09223613788cadf`。
- 固定Preview URL: https://tribe-neon-ib4x838ie-kiyoshi-kitamura.vercel.app
- UI deployment: `dpl_83M7uSNXNFfTKbEFaHq3X48YDXWA`、Preview / READY、aliasなし。
- Edge: `resolve-battle` v7 / ACTIVE / JWT検証あり。
- Edge bundle SHA256: `b762e7c25826f9a417c87cf550388e291f2c75d0e278599e6a1d3dcd70fd8b21`。読み戻した5ファイルが採用ソースとLF正規化後に一致。
- 接続設定: `NEXT_PUBLIC_APP_ENV=preview`、`NEXT_PUBLIC_USE_MOCK_DB=false`、Supabase URLは対象Preview、`NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true`。認証キー・QAセッションは証跡に含めていない。

最初の配信SHAは `99c534bb63a2659b5569d339b3ff51c49d398339`、URLは `https://tribe-neon-pdtk7d8o1-kiyoshi-kitamura.vercel.app`。復帰不具合を検出し、上記の修正版固定URLへ切り替えた。旧URLを合格版として扱わない。

Vercelのメタデータは両配信SHAに一致。`gitDirty=1` は取得途中の文書・証跡等を含む作業ツリーのため記録されている。配信対象392ファイルは各採用commitとLF正規化後に照合した。証跡は `.vercelignore` で配信対象外。

## 変更枠と並走変更

KPI側と演出側から共有Previewの変更停止を確認し、演出側の停止枠は19:17:02～20:17:02 JST。Edge→UIの順で配信し、修正版UIも同枠内で配信した。既存共有alias20件は初回・修正版の配信後とも同じ接続先を保持。

20:08 JSTにKPI・演出親側・演出PC側へ変更枠の解放を通知済み。追加適用は新たな変更枠で行う。

KPI候補 `314b38f170001a1d88f57e05e39e9eeb866b0dc3`、演出候補 `55a6a9b95032dffc8e82c59c3c318016a3cfa89a` は今回mergeしていない。親側未統合分に製品UI・Edge変更がないという指定に従い、統合待ちでは停止しなかった。`251dc03` はRaid基準そのものではなく、基準＋PC準備履歴＋今回の復帰修正の配信SHA。並走製品変更を統合したSHAとは区別する。

## 検証結果

| 内容 | 結果 |
|---|---|
| 採用コード型チェック・build | PASS。修正版も両方exit 0 |
| Room契約回帰 | 107 PASS |
| UI関連回帰 | 73 PASS（activity14 / browser28 / clear4 / ranking5 / cutover3 / useBattle19） |
| 既存戦闘 | canonical runtime、full skill load、支援スキル選択を含むAI監査、演出契約、MVPの5スクリプトすべてPASS |
| DBフラグ無効時 | 一覧読み取り成功、作成RPCは55000で拒否。UIも作成失敗を表示。ただし停止理由の専用文言ではない |
| 専用ユーザー・Guild | 新規3名と専用Guildを作成し、QAとして開始時から除外分類 |
| Room作成 | PASS。同一作成要求IDは同じRoomを返す |
| 通常参加・救援 | PASS。Guild救援参加と、既参加者が救援へ変更されないことを確認 |
| 救援依頼再送 | PASS。同一要求IDで同じ全体／Guild公開を返す |
| 3役の戦闘確定 | PASS。各1戦、無料初回、共有HPと個人貢献へ反映 |
| 戦闘再送・別ユーザー保護 | PASS。同じ開始要求・Replayを再利用、追加反映なし。別ユーザーのReplay確定は404で拒否 |
| UI復帰 | 初回は不具合。`251dc03` で3役とも同Replay再生→結果→Room復帰と確認台帳更新を実機確認 |
| 討伐・両Present受取 | 未完了。下記の戦力条件とHP調整の承認待ち |
| 24時間失効 | 別Roomで継続確認。期限2026-09-09 19:40:55 JST |

`99c534b` 以前の準備で、文書内の保存済みDenoソースがTypeScriptの対象に入ってbuildを妨げたため、`tsconfig.json` から `docs/development/evidence` を除外した。実行コードへの影響はない。

## 復帰不具合と修正

実ブラウザーでEdgeは200・確定済みReplay32 eventsを返したが、復帰後の「討伐開始」が再生へ進まなかった。復帰処理が開始要求を解放した後、確認処理がその要求を必須としていたのが原因。

`251dc03` は現在のユーザーの確定済みRoomなら新規開始・再確定なしで再生を許可する。またPreviewに旧互換テーブル `battle_sessions` が存在しない場合も、Resultを確認して戻る時点でRoom要求台帳をackする。ack失敗時はResultと復帰情報を保持する。旧テーブルは追加していない。

追加2テストでは、追加RPCなしの再生、旧テーブル不在、ack失敗時の保持と再試行を確認した。UIの復帰結果は保存済み戦闘時点のHPを示し、Roomへ戻ると最新HPに更新された。

## 専用QAデータ

| 役割 | 名前 | user ID |
|---|---|---|
| 主催者 | R0908H01 | `fadc944c-0b15-472c-be4d-305c26d8163f` |
| 通常参加者 | R0908N01 | `25975265-f042-4dd1-8ffc-a12f8414a035` |
| 救援参加者 | R0908R01 | `5c53fd8d-245b-49da-8ca6-b7afd6b7e6f0` |

Guild `R0908Guild01`: `d42ae136-03b9-4591-b5c4-ede0ab9c2e50`。主催者がMASTER、他2名がMEMBER。既存19ユーザーは流用していない。

通常の匿名登録、チュートリアル、ガチャ、育成、編成、巡回、Edge戦闘、報酬受取で3名ともLv5へ進め、主催者は通常のGuild作成費500を支払った。ユーザーレベル・通貨・戦闘結果をSQLで直接作っていない。セッションはローカルの非配信領域にのみ保持。

疎通Room: `af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3`、boss instance `c127f1da-9a60-4919-b351-6a99412574d7`、初級キングス・クラウン。救援3,117、主催者3,659、通常参加者4,685、合計11,461ダメージ。残HP31,988,539 / 32,000,000。最初の3戦は各ユーザーの無料初回で、RPは各5を保持。

20:07:01 JSTの別接続チェックで、3件のReplayすべてがUIで確認済み、各1戦・RP消費0、共有HPは同じ31,988,539と確認した。記録は `final-room-verification.json`。

24時間確認Room: `3972a461-b45f-4b02-8142-75f294461ae3`。開始2026-09-08 19:40:55 JST、期限翌日19:40:55 JST。HP・期限を変更せず、戦闘も行っていない。監視 `raid-preview-24` を19:45に設定した。

## 適用済み設定・Cron・保持確認

今回の設定はPreview疎通用暫定値。正式バランスの確定ではない。救援条件は初級2戦/16,000、中級2戦/68,000、上級3戦/205,000、超級4戦/290,000。救援PresentはCHAR_EXP_S×1、討伐PresentはEQUIP_EXP_S×1。討伐側は個人貢献が厳密に0超を条件にする。

`raid_room_creation_settings`・`raid_room_battle_settings`・`raid_room_rescue_settings` はtrue、`raid_legacy_settings` はfalse。救援・討伐報酬は各4難易度を有効化。旧Raid停止→Room有効化を別トランザクションで順に実行した。

期限Cronはjob13 `raid-room-expiry-minute`、毎分 `select public.finalize_expired_raid_rooms_v1(100);`。連続成功を確認。既存6Cronは保持し、migration履歴は275件のまま。保護対象共用関数378件の本文に差分なし。既存19ユーザーの全行ハッシュは適用前と同じ `b868375386785c9dfdad599129f9005f`。

設定・Cron・切替はそれぞれ一意な変更ID、payloadハッシュ、採用SHA、承認参照を `deployment_audit_raid_v1.applied_changes` へ同じトランザクションで保存。今回のSQLは `evidence/raid-room-connection-20260908/` の `settings-apply.sql`、`cron-apply.sql`、`legacy-stop.sql`、`room-enable.sql`。実行ファイル全体のSHA256は `activation-manifest.json`。台帳payloadハッシュとは対象が異なる。すべて再実行拒否ガード付き、UTF-8・LFで保存。

実行SQLの原文には準備時の「未実行」「適用は行わない」という注記が一部残る。実行済み原文のハッシュを維持するため修正していない。今回の実施状況は `live-operation-results.json`・`final-audit.json` と適用台帳で確認する。

## 残件と注意点

1. 初級HP3,200万に対し、新規専用ユーザーの1戦は約3千～5千。通常条件での討伐は今回の変更枠内では到達できていない。QA用別RoomだけHP20,000へ調整する案を照会中で、未承認のためHPは変更していない。救援条件・正式マスターも変更していない。討伐・両Presentの発行／受取／二重受取拒否をPASSとして扱わない。
2. DB無効時のUIは汎用失敗文言。停止理由を示す表示への改善は残る。
3. Room戦闘Resultには「報酬情報は現在未提供です」が残っている。Room報酬取得APIと別タブの提供状態に合わせた文言レビューが必要。
4. `battle_sessions` の404を含む旧互換読み取りは残るが、Roomは修正したサーバー要求台帳で復帰できる。その他の既存画面の403/406等は今回のRoom成功とは分けて記録した。
5. 24時間失効は翌日の別確認。未到来を合格扱いしない。後続の演出・KPI統合では今回の `useBattle.ts` 22行追加/2行削除の修正を失わないこと。

20:03頃JSTから、演出側の新規QA `ae28676d-bdca-4f8d-b574-183da188104c` 自身の通常チュートリアル等だけを並行実行可能とした。既存19名・Raid専用3名/Guild/Roomと、環境設定・Edge・alias・Deployには触れない限定範囲。保持照合ではRaid QA開始時刻より前の19ユーザーを抽出している。

停止・復旧手順は同証跡ディレクトリの `recovery-procedure.md`。QAデータと台帳を保持し、旧Edge v6や復帰不具合のある初回UIへ戻さない。
