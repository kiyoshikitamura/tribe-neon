# 本番公開前の残件集約

候補SHA: 8c0fa6b2131faaed7b63e172ac12424d3fe8f6be（固定）。今回の追加は準備資料・検証スクリプト・証跡のみ。製品コード、前工程SQL Bundle8本、public-settings.jsonは変更なし。証跡commitは製品候補SHAと区別する。

## 設定値の承認事項

settings/README.md / proposed-public-settings.json参照。難度順は初級・中級・上級・超級。

|項目|初級|中級|上級|超級|区分|
|---|---:|---:|---:|---:|---|
|総合力下限|なし|160,000|200,000|240,000|確定|
|討伐貢献Damage|1,000超|10,000超|30,000超|50,000超|新規初期案|
|救援戦数 / Damage以上|2 / 16,000|2 / 68,000|3 / 205,000|4 / 290,000|既存暫定の採用案|
|討伐 EQUIP_EXP_S|3|5|8|12|新規初期案|
|救援 CHAR_EXP_S|2|3|5|8|新規初期案|

救援条件は戦数AND貢献。討伐は正式確定戦闘1以上・Room撃破も必要。数値提案は未承認・未適用・disabled。公開HPは既存28M〜38Mを保持する案で、自然最大HPからの完走時間は今回未検証。QA短縮HP、閾値0、テスト数量は公開案へ転用していない。採用後は設定差分SQLを別hashで固定し、境界と発行数量だけ追加確認する。既存Bundleの黙示改変や再投入をしない。

## 検証結果

- 候補保持: Raid3ec0450は祖先。StreetBattleViewerは84a1231と完全一致。CharacterPresentation/CSS/rarityAssetsはAccepted894bcb6と完全一致。型/build/対象回帰は前工程PASSを再利用し、今回製品変更に伴う再検証対象なし。
- Bundle保持: verify-manifest.mjsが8本+設定hash MATCH。前工程の再構成DB適用・復旧・再送/旧戦闘境界PASSを再利用。
- 配信対応: exact8c archiveをaliasなしの専用Previewへ配信、READY/HTTP200。active環境・Supabase URL・anon参照先一致。deployment/参照。
- 実Fresh不足分: 同一QAで正規認証完了→通常passwordログイン→signout→再ログイン、装備5UUID保持/追加0 PASS。管理確認は実メール受信の試験ではない。fresh-acceptance/参照。
- 実接続PASS: 本人Auth→主催/通常参加/救援→8戦のEdge確定→討伐→4件発行・受取。二重受取4件拒否、最終Replay再送でboss/戦闘8行/Present/受取後inventory不変。QA専用Room HP短縮と専用救援者RP補充を使用。公開設定と自然完走/自然回復のPASSには読み替えない。
- Cron: 同一定義の既存24時間自然期限終了・Cron成功記録を再利用。再投入なし。
- 定義対応: 対象Raid/初期装備関数本体・owner/search_path/result一致。Previewには8関数のservice_role EXECUTE追加と無関係KPI16関数差分があり、全DB完全一致とは扱わない。詳細はlive-rehearsal/。

## 残る阻害要因

1. 表の初期設定案の承認と、承認値の設定SQL固定・限定検証。HP維持と自然完走時間未検証を区別した初期バランス判断。
2. 実Fresh画面完走、通常攻撃/スキル命中画像、HP/ダメージ同期、cutin解除、SKIP非表示、Result→継続の実接続表示と人の受入。ブラウザーsurface接続がないためHTTP PASSから推定しない。Character側の受入にまとめる。必要なのは下記Previewへ接続可能なブラウザーと専用QA資格の既存手順での再準備。新たなDB環境やProduction書込権限は不要。

受入先: https://tribe-neon-fq91mseva-kiyoshi-kitamura.vercel.app / dpl_ED1F6kxMiv12LQXaLwv72T1Mfbxk。

## 共有変更と本番直前確認

今回の変更は専用PreviewのQAデータとaliasなし専用Preview作成のみ。Production書込/Deploy/公開切替なし。SQL再投入・Edge再Deploy・全体設定変更なし。QA fixtureはBが対象・前後値を記録し、自然回復や自然完走の証拠にはしない。

既存RUNBOOKのDB→対応Edge→専用Preview確認→限定www/apex切替→smoke順序と中止/復旧を維持する。実行担当は本タスクに一本化し、Character側から二重Deployしない。KPI並行作業が存在するため本番直前に最新Production実配信SHA、DB実定義/KPI差分、Edge版、Cron、フラグ、全alias対応を再読し、前工程baselineからの差分を判定する。今回の75alias不変証跡は実行時点の保証には使わない。汎用promote/rollbackでKPI aliasを動かさない。これらは将来の実行条件であり今回の本番実行指示ではない。
