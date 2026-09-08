# Preview Edge・UI接続準備

2026-09-08。準備のみ。Deploy・Cron登録・運用有効化・push・本番変更・ユーザー作成は実施していない。

## SHAと配信対象

適用済みDBのdriverは `06b7c90e42c790133077d48d998bd6b2a0dcaf20`、適用証跡は `bf9a5c1`。両commitは `375a0ad642a81e9db10a9379f03e5e5f77fb4562` の製品コード・元migrationを変更していない。DBには調整済み差分が既に入り、元14本を再投入しない。

| 系統 | 取得した先端 | 次回への扱い |
| --- | --- | --- |
| 親Raid / codex/raid-room-rescue-20260908 | 375a0ad642a81e9db10a9379f03e5e5f77fb4562 | 取得可能な暫定コード候補。DBとの照合基準と一致 |
| KPI / codex/kpi-daily-monthly-20260908 | 314b38f170001a1d88f57e05e39e9eeb866b0dc3 | 共通祖先以後15ファイル。親が採用を決める並走差分 |
| 演出 / codex/gacha-presentation-v3-20260908 | 55a6a9b95032dffc8e82c59c3c318016a3cfa89a | 共通祖先以後75ファイル。親が採用を決める並走差分 |

親チャットの最新記録は「未統合修正と候補SHAを整理する必要あり」で、別の確定SHAは提示されていない。上記はremote fetch時の取得先端であり、親の最終採用宣言ではない。親候補の確定後は375a0adとの差分を追加照合する。勝手なmerge/cherry-pickはしていない。

並走ブランチはそれぞれ別の履歴なので、375a0adとの単純なtip同士のdiffを「並走追加分」と扱わず、共通祖先からの変更を保存した。KPIとの重複は `scripts/verify_kpi_tutorial_union.mjs`。演出との重複は `.github/workflows/quality.yml`、`package.json`、`src/hooks/useBattle.ts`。特にuseBattleのRoom開始receipt、pending復旧、Replay確定、報酬表示と新演出の統合を再試験する。並走tipそのものを配信するとRaid一式を欠く可能性がある。

詳細なファイル一覧・commit列・共通祖先・EdgeファイルSHA256は [candidate-comparison.json](evidence/raid-room-edge-ui-prep-20260908/candidate-comparison.json)。KPIのDB保存結果migrationは別名の履歴で既に保持されているため、並走コード採用時にもそのmigrationを自動再適用しない。

## 現配信とEdge差分

管理APIで現Previewの `resolve-battle` はACTIVE v6、verify_jwt=true、bundle hash `63c6c7d4a5e7fefc0b06aef943c4fd75b5446ec594f8d5db69480634b524d8c1`。取得ソースを証跡へ保存した。

375a0adとのruntime差分はindex.tsのRoom分岐追加と、新規 `raid-room-route.ts`。engine.tsは現配信と同一SHA256。配信単位はindex.ts＋engine.ts＋raid-room-route.tsとそのimport依存で、engine_test.tsは試験用。

新Edgeは認証ユーザー本人のReplayを取得し、RAID_SERVERに対して `get_raid_battle_route_v1(p_replay_id)` の保存台帳判定を必ず経由する。ROOMなら `finalize_raid_room_battle_v1`、LEGACYなら旧finalizer。不正値やlookupエラーは409で停止し、旧経路へfallbackしない。クライアントが送るmodeで確定先を選ばない。

既知の固定UI URL `https://tribe-neon-705g1hvhg-kiyoshi-kitamura.vercel.app/` は19:00 JSTにHTML200・JS14/14が200、JS内Preview ref一致を確認。これは固定配信URLの確認であり、現在の可変alias・管理画面の環境変数・認証後UI受入の確認ではない。既知の配信SHAは375a0ad。次回は新しいimmutable URLとbuild SHAを必ず記録する。

## 接続設定

| 対象 | 設定・確認 |
| --- | --- |
| UI | NEXT_PUBLIC_APP_ENV=preview |
| UI | NEXT_PUBLIC_SUPABASE_URL=https://sufvuqdnqohpfzkwxohq.supabase.co |
| UI | NEXT_PUBLIC_SUPABASE_ANON_KEY=同Previewの既存公開キー。値はRepositoryに保存しない |
| UI | NEXT_PUBLIC_USE_MOCK_DB=false |
| UI | NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=trueは後続のRoom接続用buildでのみ。現在は変更しない |
| Edge | SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEYが同Previewに属することを確認。service roleをUIへ渡さない |
| Edge | verify_jwt=trueを維持。ユーザーJWTのauth.getUserとReplay所有者確認を維持 |

NEXT_PUBLICの値はbuildに埋め込まれるため、配信後にDBフラグだけ変えてもUIを出せない。UI公開フラグとDBの作成・戦闘・救援フラグは別物。最初は対応Edgeを配信し、Room UIを出した専用Preview buildでもDBフラグはfalseのまま停止表示・読み取りを確認する。UI flagは全ユーザー向けbuild条件であり、専用3ユーザーだけをDBで許可する仕組みではない。後続の運用有効化は共有Previewのアクセス範囲と時間を合わせる。

GameContext、RaidTab、raid配下component、raidRoom各domain、useBattle、Guild/Activityの救援リンク、Present受取の通常経路を同じ統合候補から配信する。/qa/raid-roomのmock画面だけで接続完了としない。

## 専用fixtureと疎通設定案

既存19ユーザーは流用しない。[test-users.md](raid-room-step2/test-users.md)を採用する。3つの独立profileで新規匿名signup→正規初期化→Game StartからQA分類→チュートリアル完了、Lv5・実所持編成・RPを確認。名前案はR0908H01/N01/R01、GuildはR0908Guild01。主催者はCash500を通常進行で確保しcreate_guild_v2、残り2人はjoin_guild。UUID・Guild ID・作成時刻をrun manifestへ記録し、tokenやpasswordは保存しない。通常参加者を後から救援へ昇格させない。

READ ONLY確認時、4難度とも24時間・定員20、同時ACTIVE Room上限は初級/中級/上級10、最上級5。minimum_powerは初級NULL、中級160000、上級200000、最上級240000。救援閾値はNULL、報酬品目なし、両報酬は無効、Room3フラグfalse、legacy true、期限Cron0件。

疎通用の提案値は次のとおり。正式バランス承認ではなく未投入。初回一連検証はbeginnerに限定し、高難度は戦力と条件を揃えた別runにする。

| 難度 | 救援確定戦数以上 | 救援Damage以上 | 討伐Damage超過 | 救援 / 討伐品目 |
| --- | --- | --- | --- | --- |
| beginner | 2 | 16000 | 0 | CHAR_EXP_S ×1 / EQUIP_EXP_S ×1 |
| intermediate | 2 | 68000 | 0 | 同上 |
| advanced | 3 | 205000 | 0 | 同上 |
| expert | 4 | 290000 | 0 | 同上 |

[smoke-settings.proposed.json](raid-room-edge-ui-prep/smoke-settings.proposed.json)と生成済み[smoke-settings.review.sql](raid-room-edge-ui-prep/smoke-settings.review.sql)を用意した。UTF-8/LF・末尾ROLLBACK、設定version1、報酬enabled=falseを維持し、Roomフラグを変更しない。現品目IDと設定が未投入であることを適用直前に再確認する。生成SQLは4難度の品目をDELETE/INSERTするので、既存品目が入っていれば停止して差分を再作成する。同じ適用台帳IDでの再実行はしない。設定の保存は別IDで記録する。

beginnerでも新規編成が2戦・16000Damageを満たす保証は未検証。救援者の2戦終了前に主催者が討伐しないよう手順を調整する。不足時は実測を報告し、閾値変更の承認を別に得る。HP・経済・貢献台帳の直接更新で合格を作らない。

## Room期限Cronの別適用

[03-expiry-cron.sql](raid-room-step2/03-expiry-cron.sql)が適用案。job名 `raid-room-expiry-minute`、schedule `* * * * *`、command `select public.finalize_expired_raid_rooms_v1(100);`。同名jobがあれば定義を確認して停止、重複登録しない。現6件のCronは保持する。100件は1回の処理上限であり、滞留があれば次回へ持ち越す。KPIの07/37分と重なるため、後続試験で処理時間・lock・失敗・滞留を確認する。

登録時は独立適用ID、SQLハッシュ、jobid、schedule/command/active、登録前後6→7件の差分を保存。driver末尾は現状ROLLBACKのまま。後続承認時のみ保存版を作る。復旧で停止する場合は記録したjobidだけを対象とし、既存KPI・Ranking・cleanup Cronを一括変更しない。

## 次回の適用順

1. 親の統合候補SHAを確定。06b7c90/bf9a5c1の記録・ガードを取り込み、375a0ad以後のDB契約変更がないか照合。useBattle統合、型・lint・build・Room回帰を実行し、採用SHAを固定する。
2. KPIと変更枠を合意。台帳・DB postflight・現フラグ・既存データ/CronをREAD ONLYで確認。適用済みDB差分を再実行しない。
3. 別途Deploy承認後、同候補のRoom対応resolve-battleをPreviewへ配信。新version・bundle hash・ファイルhashを記録。未認証拒否、本人Replay制御、legacy経路維持を確認する。
4. 同候補のUIをPreviewへ配信し、immutable URL・build SHA・接続ref・Mock無効を照合。Room DBフラグfalseの停止表示と読み取りを確認する。
5. 専用3ユーザー・Guildを正規経路で準備・QA分類する。疎通設定をレビューし別IDで保存、報酬・Roomフラグはまだ無効。
6. 別工程として期限Cron登録を承認・実施し、job実行結果と既存Cron保持を確認する。
7. 運用有効化を別承認。開始済みlegacy Replay・報酬を確認して既存切替手順に従い旧新の競合を避け、両報酬を先に準備したうえでRoom操作を開始する。今回の準備ではフラグ更新SQLを実行しない。

## 一連の確認手順

| 段階 | 操作と確認 |
| --- | --- |
| 作成 | 主催者がbeginnerと実boss候補を選択。create_raid_room_v1のrequest IDを保存。Room1件、owner/Guild/期限/初期HPを確認。同request再試行でRoom増殖・二重消費なし |
| 通常参加 | Nがregister_raid_room_v1→briefing。membership1件、通常参加として保持、参加だけで戦闘開始扱いにならない |
| 救援 | Hがrequest_raid_room_rescue_v1でGuild公開。Rは未参加状態からリンクを開きjoin_raid_room_rescue_v1。rescue IDと所属Guildの照合、救援membership、Nの後付け昇格拒否。全体Activity公開は別Roomでも検証 |
| 戦闘 | Rを先に2戦。start_raid_room_battle_v1のrequest/Replay ID、RP前後、snapshot、Edge get_raid_battle_route_v1=ROOM、finalization=FINALIZED、raw/applied Damageを記録。H/Nも正の確定貢献を作る |
| 復旧 | 通信断は新規requestで押し直さず保存receiptで照合。同Replayの再解決・reloadでRP/貢献/報酬が増えない。別人Replayは拒否 |
| 救援報酬 | Rが2戦・16000以上を満たすまで確認。get_raid_room_rescue_reward_v1で状態とpresent IDを取得。N/Hは救援資格を捏造しない |
| 討伐 | Rの条件達成後にHP0まで正規戦闘。Room CLEARED、過剰Damageのapplied上限、最終確定と両報酬台帳の一意性を確認 |
| 討伐報酬 | get_raid_room_clear_reward_v1でRの討伐資格とpresent IDを確認。H/Nも貢献条件を満たせば各人の討伐報酬を確認 |
| 両報酬受取 | Rの異なる救援/討伐present IDを通常Present画面でclaim_present。CHAR_EXP_S/EQUIP_EXP_Sが各1増加、claimed状態、再受取で増えない。get系RPCは報酬受取そのものではない |
| 期限 | 別の未討伐Roomで24時間後のCron失効を確認。時刻列を直接変更しない。短縮試験が必要なら別承認の設定・専用Roomを用意 |

成功証跡は3UUID/Guild/Room/request/Replay/Present ID、SHA/Edge version、UTC/JST、RP・HP・貢献・所持品前後、台帳とUI表示。異常時は新規作成・開始を止め、開始済みreceipt/Presentを保持して前進修正する。Room Replayが存在する状態でv6へ単純rollbackしない。

## 今回の検証範囲

Edgeルート4件、設定生成11件、RPC transport13件、計28件PASS。HTTP/ソース/READ ONLY状態確認までで、実JWTを用いたRoom操作、実Edge Deploy、認証後UI、複数接続、Cron発火、両Present受取は未実施。親の未公開候補・未統合修正は取得できないため、最終候補確定時に追加照合する。
