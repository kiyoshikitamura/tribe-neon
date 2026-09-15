# Pre-Release GO / NO-GO Checklist

更新日: 2026-09-02  
現在判定: **NOT READY**

## 1. 判定原則

- Machine Validation、Preview確認、Human Acceptance、Production Verificationを別々に記録する。
- Automated PASSだけでHuman PASSまたはProduction PASSへ昇格しない。
- Release Candidateのcommit SHAを固定し、CI、DB、Deployment、実機証跡を同じSHAへ結び付ける。
- provider、Measurement ID、Conversion ID、DSN、domain、legal文面、素材を推測で補わない。
- Production mutation、merge、domain切替は、明示承認とrollback準備の後に行う。

## 2. Release Candidate

- [ ] Release Candidate commit SHAを記録した
- [ ] 対象PR、migration一覧、Vercel Deployment IDをSHAへ紐付けた
- [ ] Release Candidate SHAのworktreeがcleanである
- [ ] typecheck、build、verifier、browser E2E全体が同一SHAでPASSした
- [ ] browser E2Eのretry、skip、quarantine、forceによる見かけ上のPASSがない
- [ ] FAIL artifactに個人情報、Secret、過剰な動画・traceが含まれない

## 3. Human Acceptance

### Battle Presentation V2

- [ ] Preview / Developmentのfull Skill load QA routeを使用した
- [ ] 通常負荷でActor → Target → Attack → Impact → Damage → HP Transition → Defeatを追跡できる
- [ ] high Skill loadでも同じ因果関係を追跡できる
- [ ] SkipとResultまで停止せず到達する
- [ ] Canonical Replay、Damage、Target、Result Authorityを変更していない
- [ ] Reviewer、端末、URL、SHA、結果を記録した

### Login Bonus UX

- [ ] 本日の獲得内容を認知できる
- [ ] 明日と将来のReward Scheduleを理解できる
- [ ] 受取済み、今日、明日、未来の状態を区別できる
- [ ] 30日後のcycleが理解できる
- [ ] 390×844 / 412×915でoverflow、clipping、tap target問題がない
- [ ] Canonical reward masterと表示内容が一致する
- [ ] Reviewer、端末、URL、SHA、結果を記録した

### Final Cross-Screen

- [ ] Desktop mobile-width shell
- [ ] 390×844（iPhone 13相当）
- [ ] 412×915（Pixel 7相当）
- [ ] Entry → Tutorial → Name → Auth → Home
- [ ] Free Gacha → Inventory → Formation → Growth
- [ ] Quest → Battle → Result → Reward
- [ ] Mission / Presentの個別受取と一括受取
- [ ] Guild加入 / 申請 → Chat、BBS、DM
- [ ] Mission mobileのstate、CTA、Claim、safe-area
- [ ] modal、keyboard、scroll、back / forward、reload、session切れ
- [ ] inaccessible CTA、nested-scroll trap、modal trap、horizontal clippingがない

### Operations exposure

- [ ] `INVITE` / `FRIEND` / `FRIEND_HELPER`が露出しない
- [ ] `SHOP` / `GVG`は確定した`UPCOMING`表現だけを表示する
- [ ] `PAYMENT` / `SPECIAL_GACHA` / `GUILD_COMBAT_BUFF`へ到達できない
- [ ] `PVP` / `RAID` / `GUILD`は継続して利用可能である
- [ ] closed deep linkがHomeへ安全に戻り、redirect loopがない
- [ ] DB / RPCは将来復旧可能なまま保持されている

### Audio Lifecycle

- [ ] iPhone機種、iOS / Safari、音声出力、URL、SHAを記録した
- [ ] fresh load / first gesture / Title → Home
- [ ] Home → Battle → Home / Home → Raid → Home
- [ ] Safari background / foreground
- [ ] screen lock / unlock
- [ ] app switch / return
- [ ] OAuth / callback return
- [ ] reload、BGM / SE ON-OFF、volume persistence
- [ ] consecutive Battle、30–60分long session
- [ ] double BGM / SE、silence、stuck suspend、volume resetがない

## 4. Production Environment

- [ ] Production Supabase refとVercel Production接続先を二重確認した
- [ ] migration history、適用SQL、schema diff、backupを取得した
- [ ] guarded migrationとpostflightの結果を保存した
- [ ] RLS / RPCのowner、他者ID、未認証、二重送信、異常値拒否を確認した
- [ ] Vercel Production環境変数を一覧と照合した
- [ ] OAuth Site URL / Redirect URLを最終domainで確認した
- [ ] custom domain、DNS、SSLを確認した
- [ ] rollback対象、担当、実行条件、所要時間を記録した

## 5. Analytics / Monitoring / Metadata

- [ ] Product Analytics providerが確定している
- [ ] Measurement IDが承認済み環境変数へ設定されている
- [ ] 広告CV provider / Conversion ID / eventが確定している
- [ ] consent、privacy、retention方針がLegalと一致する
- [ ] Productionで主要イベントを一度だけ受信する
- [ ] Error monitoring provider / project / DSNが確定している
- [ ] Source map、environment、release SHAが正しく紐付く
- [ ] テスト例外を受信し、通知先へ到達する
- [ ] Secret、認証情報、チャット本文などを送信しない
- [ ] OGP title / description / share imageを実URLで確認した
- [ ] faviconがProductionブラウザで表示される
- [ ] robots.txtの公開方針と内容を確認した

## 6. Production Smoke / 3実機

### 共通Smoke

- [ ] `/`、legal page、auth callbackがHTTP成功する
- [ ] 新規登録 / 初期化 / 再ログイン
- [ ] 無料ガチャ / 所持反映 / 育成 / 編成
- [ ] クエスト / Battle / Result / Reward
- [ ] Mission / Login Bonus / Present
- [ ] Guild / Chat / BBS / DM
- [ ] PvP / Raid / Ranking
- [ ] 報酬二重取得、通貨不整合、データ消失がない
- [ ] Production QA-only routeが404になる
- [ ] monitoring、Analytics、OAuth、domain、legal linkを確認した

### Device matrix

- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] PC Chrome
- [ ] 各端末でsafe-area、scroll、modal、keyboard、back、reloadを確認した
- [ ] 各端末の機種 / OS / browser / URL / SHA / reviewerを記録した

## 7. GO / NO-GO

### GO条件

- [ ] 主要E2EがProduction候補環境と3実機でPASS
- [ ] data loss、重大なRLS / 認可問題、報酬二重取得、通貨不整合がない
- [ ] Production DB / deploy / domain / OAuthが安定している
- [ ] P0画面が公開可能なUI品質である
- [ ] Human必須gateがすべてHuman PASSである
- [ ] rollbackを実行可能である

### 即時NO-GO条件

- [ ] 新規登録 / 初期化が不安定
- [ ] 所持データ消失または通貨 / ガチャ不整合
- [ ] 育成がBattleへ反映されない
- [ ] Quest進行不能またはBattle停止
- [ ] 報酬二重取得
- [ ] Guild基本機能不成立
- [ ] 重大なRLS / 認可問題
- [ ] Production DB / deploy不安定
- [ ] スマホ主要導線が操作不能
- [ ] rollback不能またはデータ破壊リスク

## 8. 最終記録

| 項目 | 記録 |
|---|---|
| 判定日時 | 未入力 |
| Release Candidate SHA | 未入力 |
| Production Deployment ID / URL | 未入力 |
| Production Supabase ref | 未入力 |
| Human reviewers | 未入力 |
| GO / NO-GO | `NOT READY` |
| 未解決Blocker | Human Acceptance、Production準備、Production Smoke |
| Product Owner承認 | 未入力 |

