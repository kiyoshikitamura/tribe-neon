# 固定候補の専用Preview

対象候補: 8c0fa6b2131faaed7b63e172ac12424d3fe8f6be。git archiveから抽出した製品コードを配信。今回の追加文書・検証スクリプトは配信元に含めない。

- URL: https://tribe-neon-fq91mseva-kiyoshi-kitamura.vercel.app
- Deployment: dpl_ED1F6kxMiv12LQXaLwv72T1Mfbxk
- 状態: READY / HTTP 200
- target省略のPreview、alias空、automaticAliases空、autoAssignCustomDomains=false。gitSource/branchなし。
- build環境: APP_ENV preview、MOCK false、RAID_ROOM_UI_ENABLED true、Supabase sufvuqdnqohpfzkwxohq。
- 実配信JavaScriptの環境・URL・anon JWT参照先を照合。Production ref文字列もURL検証定数として含まれるため、文字列の単純不在チェックは不適切。実設定とtoken refを確認してPASS。
- 作成前後の75 alias対応はすべて不変。wwwのProduction deploymentはdpl_A53gBsmTqXXBiUVDpXwQxpigJJMxのまま。
- SQL再投入、Edge再Deploy、Production Deploy、公開alias切替はなし。

検証環境の新規専用Preview作成だけを実行した。対象Edge v7は候補とファイルhash一致、DBはBの対象定義比較参照。配信一致・HTTP到達は実操作UI受入を意味しない。実Auth/Edge/PresentsはB、同一Fresh再認証はC、実Fresh画面と命中表示・人の受入はCの未確認一覧で管理する。

再現元は outputs/raid-prepublication-deploy のgit archive、dry file manifest、stage hash manifest。秘密envは既存専用Previewファイルをプロセスにのみ読み込み、版管理しない。scripts/raid-prepublication-deploy/deploy-preview.mjsは対象SHA/プロジェクト/Preview ref/alias baselineをguardし、attempt記録がある場合は二重発行を拒否する。既存attemptを削除して再実行しない。
