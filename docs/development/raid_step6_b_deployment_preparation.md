# 第6工程 B 配信準備

**実行手順訂正:** 下記PowerShell CLI版は親実行時、`--skip-domain`とPreviewの組合せがCLI事前validationで拒否された。送信前停止で配信は作成されていない。CLI request生成箇所だけを確認し、validation分岐を見落としたB準備の不備。Productionへ変更せず、`deploy-preview-rest-parent.mjs`を現行実行手順とする。旧PS1の`-Execute`は停止する。

候補は `2d2d2b1563e92f1471f9c86fa8a7cc59040ec726` 固定。Bは外部GETとローカルstagingのみ実施し、deploy/環境変更/alias変更は行っていない。

## 現配信・環境の再照合

2026-09-09、既存Vercel CLI認証でAPI GETを実行。Production `www.tribe-neon.com` は `dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx` / `tribe-neon-nfmjnrpd8-kiyoshi-kitamura.vercel.app` / production READY / SHA `550c02225cbecb6ba6f174ee3fb952bcaae2f6dd` を保持。

Project `prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb`、scope `kiyoshi-kitamura`、account `team_ounFOJd7sfCvcytYCkExbj77`。branchなしPreview環境のSupabase URLは `https://sufvuqdnqohpfzkwxohq.supabase.co`、APP_ENVはpreviewをGETで確認。Production URL/APP_ENVは現APIの値を復号確認できず未確認。Production Mock設定はfalse。環境一覧APIのdecrypt queryがdeprecatedだったため個別env GETへ変更し、取得不可を平文値として扱っていない。資格値は本報告・commit対象に含めない。

Project alias75件（pagination next=null）を `outputs/raid-step6/aliases-before.json` にalias/deploymentIdだけ保存。最新8配信の許可metadataを `deployments-before.json` に保存。Character専用Preview `tribe-neon-3vwv27ak3-kiyoshi-kitamura.vercel.app` はSHA `91f7a7d937fbbf427bfbaada0547f38c244e9a11` / READY。この後続を今回候補へ取り込んでいない。

## Edge live比較

Supabase `get_edge_function` / `list_edge_functions` をGETし、resolve-battle ACTIVE v7、verify_jwt=true、bundle SHA256 `b762e7c25826f9a417c87cf550388e291f2c75d0e278599e6a1d3dcd70fd8b21` を実確認した。取得5ファイル（index/engine/raid-room-route/canonical_runtime/canonical_effects）はすべて固定2d2d2b1のgit blobとLF正規化後一致。`outputs/raid-step6/edge-source-match.json` に比較結果保存。**今回のEdge追加更新は不要**。旧報告の転記ではなく現在稼働版を比較した。

## 固定stagingと親実行

`scripts/raid-step6/prepare-preview.ps1` でgit archiveした固定SHAを `outputs/raid-step6/source-2d2d2b1` へ展開済み（3404追跡ファイル）。archive SHA256: `a10f677bd50e984f7dec2600d0b4048ed03b6da8ba26d2d8217d5c4df91ee100`。ファイル別SHA256は `stage-manifest.json`。tracked `.env.example` はテンプレートで、既存.vercelignoreの `.env*` で配信除外。未追跡QA/outputs/秘密envを取り込まない。

`deploy-preview-parent.ps1` はmanifest全file hash/追加fileを検査し、既存Preview用envを外部pathから読み、ref/anon JWT role/Mock=false/Room=true/App=previewを検証する。公開キー値はログへ出さず、引数は当deploymentのbuild/runtime限定。Project環境値は変更しない。

```powershell
# 既定は検証だけ。SQL postflight完了後に親だけが -Execute を付ける。
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/raid-step6/deploy-preview-parent.ps1 -PreviewEnvFile 'C:/Users/Kiyoshi Kitamura/Documents/Codex/2026-09-08/2-375a0ad-21-raid-migration-14/.env.raid-preview.local'
```

上記既定検証はPASS。実行時は同コマンドに `-Execute` を付ける。実行policy指定はそのPowerShell process限定であり、マシンpolicyを書き換えない。

deployはCLI59.13.1固定、明示 `--target preview --skip-domain`、固定project ID。`--skip-domain` がrequestの `autoAssignCustomDomains=false` へ変換されることをインストール済みCLI `dist/commands/deploy/index.js:1128` で確認。stage cwdとprocess限定GIT_CEILING_DIRECTORIESにより親repoのbranch探索も遮断し、実行直前にgit rev-parse失敗を検証する。共有branch metadata、alias set/promoteコマンドは渡さない。メタデータは固定source SHAだけ。

親は配信後にreadyState/target/source SHA/固定URLをGETして記録し、全75aliasの前後deploymentId一致と新deploymentのaliasなしを確認する。stagingのgit除外/.vercelignoreは既存の配信仕様に従う。[Vercel公式CLI説明](https://vercel.com/docs/cli/deploy) のskip-domainはproduction向けの説明なので、それだけに依存せず、branch探索遮断・実request flag・配信後alias全件比較を合わせる。

未確認: 新deploymentのbuild/実HTTP/3役UI/実Fresh。これらは親のSQL適用・配信後にCが確認する。Bはdeployを実行していない。

## 現行REST配信手順

```powershell
$env:RAID_STEP6_PREVIEW_ENV='C:/Users/Kiyoshi Kitamura/Documents/Codex/2026-09-08/2-375a0ad-21-raid-migration-14/.env.raid-preview.local'
# --executeなしはローカルpayload検証だけ。送信は親のみ。
node scripts/raid-step6/deploy-preview-rest-parent.mjs --execute
```

CLI59.13.1の`deploy --dry --json`で.vercelignore適用後の実配信file集合を取得し、2273file/390,018,669 bytesを固定git archiveのSHA256とCLI SHA1双方で照合した。`rest-request-manifest.json`へ資格値なしのpayload条件を保存、既定dryはPASS。

RESTは [create deployment公式契約](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment) に従いtargetを省略（Preview）する。staging/production/gitSource/gitMetadata/refを指定せず、`autoAssignCustomDomains:false`と`alias:[]`を明示。前者はCLIの実request fieldと一致する。認証はCLI59.13.1の `@vercel/cli-config.getGlobalPathConfig()` → `@vercel/cli-auth.readCliAuthConfig()` と同じread-only credential loaderを用い、tokenはメモリにのみ保持する。

REST初回はgenerate curlのBearer placeholderを実tokenと誤認したため最初のalias GETで403になり、file upload/create前に停止した。team IDは正しかった。生成例からの認証抽出を削除し、上記正規loaderへ修正。`--auth-check`による実REST GETでproject/accountId一致・75alias全binding一致を確認してPASS、CLI通常GETの結果と同一であることを検証した。資格値の保存/出力や認証設定の変更はない。

75aliasのbaseline一致を確認し、[upload files](https://vercel.com/docs/rest-api/deployments/upload-deployment-files)へSHA参照用ファイルを8並列でアップロードする。再びalias一致を確認してからPOST /v13/deploymentsを1回だけ行う。単発create前にOUTCOME_UNKNOWN記録を置き、応答不明時の盲目的再送を拒否する。応答はid/url/target/readyState/alias/sourceShaのみ記録。新deployment alias/automaticAliases空、target null、固定SHA一致、共有alias75件不変を検証する。親のREADY後readbackとCの実HTTPは別途必要。

## 親配信後のB独立GET確認

2026-09-09T05:27:11Z、親が作成した `dpl_6JjqCfEgfhWb7QauPC4tb7e91WHn` / https://tribe-neon-gcg8o8bcu-kiyoshi-kitamura.vercel.app をBがGET検証した。READY / target=null、alias/automaticAliasesは空、raidSourceSha/gitCommitShaは双方固定 `2d2d2b1563e92f1471f9c86fa8a7cc59040ec726` と一致。

HTML200、script15/15が200。配信JSにPreview refがありProduction refなし。共有alias75件は件数・全deploymentId不変でpagination終了も確認、www本番は従前の550c配信を保持。検証script `scripts/raid-step6/verify-deployment.mjs`、値を絞った結果 `outputs/raid-step6/deployment-readback.json`。認証HTTP/装備403/3役UIはA/C担当であり、これらの成功を本静的配信確認で代替しない。

## 追加: 救援出典・Guild可視性の実HTTP読取

2026-09-09T05:33:40Z、既存専用QAのhost/normal/rescueを通常loginし、本人guild_members GETとread RPCのみ実施。戦闘/報酬/追加publication/所属変更は行っていない。

3名すべてGuild `d42ae136-03b9-4591-b5c4-ede0ab9c2e50` に所属（self GET各200）。新Room `a6940cc4-12eb-4c64-ba80-af3430134e96` のACTIVITY `4f939109-80c9-412d-a45d-4f577c64ccda` とGUILD `86d00b65-f50e-44b3-9f79-40f6606e9075` を照会した。

全3役×2出典でget_raid_room_rescue_v1は200、get_raid_rescue_cards_v1は200/1件。roomId/rescueIdとACTIVITY→activity/null Guild、GUILD→guild_chat/依頼Guildが一致。**6組・12read RPCの正例PASS**。Guild外負例は3役全員同Guildのため**実HTTP未確認**。人数や所属を変更して負例を作らず、未確認として親へ報告した。

script `scripts/raid-step6/verify-rescue-visibility.mjs`、結果 `outputs/raid-step6/rescue-visibility-http.json`。token・passwordは結果へ含めていない。

## 最終readback準備・B所有ファイル

最終確認コマンドは `node scripts/raid-step6/verify-deployment.mjs --final`。GETのみで専用Preview READY/完全SHA/HTMLとJS接続ref、新alias空、共有75alias不変に加えて、現www aliasのdeployment metadataを再GETしProduction550c/READY/targetを検証する。結果は初回証跡を上書きせず `outputs/raid-step6/deployment-final-readback.json` へ保存する。CのUI・親のQAfixture操作中にはQA操作を追加しない。最終実行は親の終了タイミングに合わせる。

Git statusでB所有の以下6ファイルだけを確認した。全て新規未追跡（親が選択してcommitする）。Bによるgit add/commitはない。

- docs/development/raid_step6_b_deployment_preparation.md
- scripts/raid-step6/prepare-preview.ps1
- scripts/raid-step6/deploy-preview-parent.ps1（旧方式、Executeは禁止guard済み）
- scripts/raid-step6/deploy-preview-rest-parent.mjs
- scripts/raid-step6/verify-deployment.mjs
- scripts/raid-step6/verify-rescue-visibility.mjs

3つのmjsはnode --check成功。outputsのraw edge、staging、private元envやAuth stateはcommit対象にしない。公開する証跡はalias binding/配信metadata/HTTP status/code等の選択済みJSONに限定する。配信候補は引き続き2d2d2b1固定で、後続Character等の並走成果は含めない。Edgeはlive5/5一致済みなので追加更新不要。

## 最終独立保護確認（2026-09-09 05:44 UTC）

親の最終GET許可後、05:44:21 UTCにPreviewへのread-only transaction内SELECTで42テーブルの件数・内容MD5を基準と比較し、全件不変を確認した。通常canonical master・Raid master/rules/items/settingsを対象とし、QA進行、新Room、Presents、日次rowなど正規操作で変わるデータを除外した。Cron7件はschedule/active/command MD5等が不変、creation/battle/rescue flagsも不変。fixture実行SQLの保護値と旧Room2件のroom/boss MD5計4値が一致した。証跡は `outputs/step6/final-protection-readback.json`（PASS）。DDL/DMLとQA操作は実施していない。

05:44:35 UTCに `node scripts/raid-step6/verify-deployment.mjs --final` を実行しexit 0。専用PreviewはREADY、完全SHA2d2d一致、target null、alias/automaticAliases空。共有75aliasは全件不変、Productionは550c02225cbecb6ba6f174ee3fb952bcaae2f6ddのREADY/productionを保持。HTMLとJS15件はHTTP200、JSはPreview refあり/Production refなし。証跡は `outputs/raid-step6/deployment-final-readback.json`。Edge追加更新不要の判定は既存live bundle5ファイル一致証跡を維持する。
