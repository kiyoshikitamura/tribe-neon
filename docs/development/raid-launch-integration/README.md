# 公開候補への28編成統合

旧公開候補f8b104aa1d3366478df685166afb708649261cf9（製品8c0fa6b）へ、直系後続6c6b4feをfast-forward統合した。1bf1bbeの専用Profile接続と6c6b4feのrarity修正を両方包含。今回の追加commitはBundle構成・検証・未承認設定案を収録する。巻戻し・カード枠の再分岐なし。数値表はTABLES.md、未承認値はproposed-settings-v3.json。

## 装備・スキルの最終状態：ローカル統合完了

旧8c/f8候補の敵装備空・共通HARD Skill poolから、Raid専用の装備42種・Skill30種へ接続した。全28組が異なる集合、各エリア20人は重複なし、全60Characterを使用する。

|難度|敵構成|敵Lv/覚醒|装備枠・Lv・＋|スキル枠・＋|
|---|---|---|---|---|
|初級|N3/R2|5/0|1枠・Lv1・＋0|1〜2枠・＋0|
|中級|R3/N1/SR1|25/0|2枠・Lv10・＋0|1〜2枠・＋0|
|上級|SR3/R2|35/1|3枠・Lv15・＋1|2〜4枠・＋1|
|超級|SSR3/SR2|45/1|4枠・Lv20・＋2|2〜4枠・＋2|

1bf1bbe→6c6b4feでは140枠中121枠のCharacter変更、18枠のSkill差替え/除外、装備変更0、ATK/DEF/SPD/LUK変更0、HP24/28組変更。専用Skillは本人に対応し、参照・枠・育成・カテゴリ整合PASS。最大HP比例回復・継続回復・シールドは専用枠に追加なし。

Player所持装備・スキル、共通master/成長曲線/Formula/Edgeは変更なし。比較Player20枠の装備能力値について実SQL値一致。作成済Roomは固定敵snapshotを保持する。今回Preview DB/Productionへ適用していないため、実配信での完了とは区別する。

## Damageと閾値の判定

TABLESの代表Damageは7エリアのseed平均を等重み平均。必要戦数は各エリアでceil(共有HP/平均Damage)、全参加者合計。6c6b4feの最終96戦（各組3〜6seed）を設定・master・Edge hash一致確認の上で再利用し、新規simulationは0戦。人数と戦闘供給を均等に仮定した推定であり、実時間の討伐保証ではない。

旧救援Damageは全難度で観測最小1戦Damage未満。ただし必要戦数ANDがあるため、1戦で救援報酬を取得できるという意味ではない。旧討伐閾値も観測最小1戦の約2.6〜17%で緩い。新討伐案は最小の約24〜26%、救援案は必要戦数×最小の約64〜77%を目安にした丸い初期値。救援2/2/3/4戦と報酬品目・数量は旧未承認案から維持する。

討伐は閾値の厳密な超過・正式戦闘1以上・撃破。救援は戦数AND累計DamageAND撃破AND救援参加。新閾値は代表Partyに対する初期案で、参加下限の全編成への保証はない。高火力者の早期討伐によって救援者が戦数未達になる点は既存仕様どおり。秋葉原上級は平均Damageが中級より低く、HPで必要戦数を調整済み。Raid本人属性×2/Guild×2は未接続のままで、仮想乗算していない。

実設定はnull/disabledを維持。報酬SQLは未生成・未適用。QA閾値0・短縮HP・テスト報酬は採用しない。設定改版は作成停止→進行中Room/開始済Replay終了→改版の既存手順を使用する。

## 検証

- 28Profile/140敵stats/60Character/42装備/30Skill参照PASS。
- 追加Bundleそのままの作成→戦闘開始28組PASS。設定変更後の既存Room保持PASS。
- 追加Bundleの原子的rollbackで関数・新設table復元PASS。
- 352保護対象（共通master/Formula/Edge/旧Bundle）不変。
- 関連DB回帰47件・新編成表示5件PASS。
- typecheck PASS。既存Previewの公開envを使用したローカルbuild PASS。Deployなし。

最初の検証ではcheckout改行変換でMD5 guardが停止した。Git原本LFへ戻し.gitattributesで固定して解決。型検査は前回の配信用archiveをoutputs内で拾ったため生成物をTempへ移して再実行PASS。buildはenv未指定と--env-fileのworker継承で失敗した後、既存Preview envを子processへ読み込む方法でPASS。guardを緩めたり製品型を除外していない。

## Bundle差分・適用順序・復旧

旧8本を保存し06-launch-balance.sql、07-launch-postflight.sqlを追加。review-apply-v2.psqlは00→01→02→04→06→07を同一transactionで実行し、既定ROLLBACK。06は原本SQLの外側BEGIN/COMMITだけをwrapperへ移したもの。関数本体・設定データは同一。元SQL hashは09a168716cb3a6ddd65aaed1016c2ba7f01ef670f48d54087cf5c64d2e413aa4。bundle-manifest.jsonで全参照ファイルhash固定。

今回06/07の適用・rollback・28RPCを隔離PGliteで検証した。旧00〜04のProduction再構成PG17 PASSは既存証跡を再利用。新しい全wrapperを最新本番catalogへ再適用したとは扱わない。適用済み環境へ旧Bundleや06を再投入しない。既存Previewは新28Profile未適用のため、前回8cの実接続PASSはこの新SQLの実接続PASSではない。

次の専用Preview適用では3関数baselineとtable有無を実定義照合し、06/07だけを適用する専用手順を作る。未承認の報酬設定は別hashで固定してから限定境界試験する。

DB適用→変更なしの対応Edge照合→今回候補Frontend→実接続確認→承認済設定/Cron/公開操作の順序。commit前はrollback、commit後は既存05停止手順で新規作成/参加を止め、開始済Replay・receipt/Present・固定snapshotを保持して前進修正する。公開HPで開始したRoomを旧HPへ戻さない。

KPI並行更新があるため、本番直前に最新定義/alias/Edge/Cronを再照合しguard差異は中止条件。担当は親タスクに一本化。今回本番書込・外部DB適用・Deploy・公開切替なし。残件は新SQL/Frontendの専用Preview実接続、Characterとまとめる実Fresh/命中表示/人の受入、公開設定承認と承認後の設定差分検証。
