# 過去の未決事項と解消記録

最新決定: Seasonは3カテゴリとも正式オープンと同時開始。POWER/GUILD_POWER報酬はspecs/TRIBE_NEON_Season_Ranking_Reward_Master_20260914.mdで確定。以下1・2の依頼は解消済み、3の売上KPIは公開後残件でリリースGateではない。以下は判断前の監査履歴。

2026-09-14。監査基準: 141833fcc20c89b1fdc69bcc0b9edda8c9293b5c。
Preview DB: sufvuqdnqohpfzkwxohq。READ ONLY確認。以下は未決事項の依頼文であり、提案の承認・実装開始・本番操作を意味しない。

## 1. Season間のPvP

依頼文:
> 9/15の旧Season終了から9/16 00:00 JSTまで、PvPを遊べるようにするかを指定してください。遊べる場合は、RATE・Season勝利数を新Seasonへ持ち越すか、Daily勝利数には加算するかも指定してください。

必要な理由: 新Season未開始は確定しているが、既存finalizerはSeasonがなくてもRATE／Winsを更新する。予約処理だけではインターバルの戦績扱いが決まらない。
閉鎖とする場合、新規開始停止だけでなく、旧Seasonから持ち越された戦闘の終了扱いも実装側で既存boundary契約と照合する。

## 2. 個人／Guild総合力のSeason終了報酬

依頼文:
> 個人総合力・Guild総合力の「現行Season終了報酬」の確定表または出典を共有してください。既存定義がない場合は、両カテゴリの終了報酬を設けるかどうかを指定してください。設ける場合は順位帯・品目・数量、Guild報酬の受取対象も必要です。

必要な理由: 既存canonical DB payload・Repository JSON・UI投影に、両カテゴリの通常Season終了報酬定義がない。Daily報酬とプレOPEN1位Guild装飾は存在するが、通常Seasonへの転用根拠ではない。
「現行維持」を無報酬またはPvP報酬流用と解釈しない。PvPの終了報酬は定義があるので再質問・再設計しない。

## 3. 売上KPIの集計契約

依頼文:
> 売上KPIの既存確定定義があれば共有してください。なければ、以下を別スレッドで確定してください。
> - 計上時刻: 決済成功時刻／ゲーム内配送完了時刻のどちらか。
> - 金額・返金: 表示する税込売上から返金を差し引くか。差し引く場合、返金日か元購入日へ反映するか。
> - PU・ARPPU・ARPU・PUR: 集計対象者と、日次／月次の分母。
> - QA／Sandbox／プレOPENユーザー: 売上・購入者・分母から除外する範囲。
> - 課金公開前と分母0: 対象外／0の表示方針。

必要な理由: Previewのrefresh_kpi_revenueは現在も未実装stub。PAYMENT CLOSEDなら対象外を記録し、それ以外はF10–F13未確定エラーとなる。PURも旧stubにはない。
DAU自体の既存定義は再議論しない。「実Authセッション＋プロフィール行あり」を前提に、売上指標へ使う対象範囲だけを確認する。
「プレOPENユーザーを課金検証対象外」とする既存方針を、将来の実売上から除外する方針へ自動拡張しない。

## 再質問しない確定事項

- 第1SeasonはPvP／個人総合力／Guild総合力の3本。
- 期間は9/16 00:00 JST以上、10/1 00:00 JST未満。延期時は日時・告知を一括更新。
- プレOPEN限定Guild報酬は1位のみ。名称・ID・画像は素材統合で既存実装に合わせる。
- 商品価格・内容、EXP余剰保持、最終Lv100で素材使用不可、Guild加入Day1は今回の未決依頼に含めない。
- 決済available:falseは仕様判断ではなく環境診断待ち。Vercel403／ローカル実行環境停止に対する再認証要求やアクセス試行を繰り返さない。既存診断を実行できる担当が、秘密値を含まない判定結果を返す運用とする。

## 根拠・今回の確認範囲

- formal_open_integrated_release_management_20260914.md §3.3: Season日付。
- formal_open_season_contract_implementation_20260914.md: interval中RATE/Wins未確定。
- formal_open_season_scope_and_reward_projection_20260914.md: 3カテゴリと終了報酬欠落。
- billing_kpi_preflight_20260914.md、KPI Authority/M1/M2/M3/production-final-preflight: 売上契約未回収。Acquisition等のQA除外規則を売上へ転用しない。
- 最新Preview get_public_ranking_reward_master(): プレOPEN装飾は1位1件へ修正済み。通常POWER/GUILD_POWERのSeason progressionは依然欠落。
- 最新Preview refresh_kpi_revenue(): F10–F13未確定stubを再確認。

回答は各別スレッドで確定し、本流には決定内容・出典だけ返す。Season実切替、報酬付与、Production変更は行っていない。
