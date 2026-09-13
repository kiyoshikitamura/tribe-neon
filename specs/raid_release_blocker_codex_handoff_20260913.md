# Raid Release Blocker修正：Codex再配信・差分受入依頼
2026-09-13 / 修正候補・実画面再受入前

## 対象
Repository: kiyoshikitamura/tribe-neon
Branch: codex/raid-release-blocker-fix-20260913
アプリ差分base: 63e43b76adaf880e5569526ba52558c0aae0e68b
直前の配信: dpl_8n6qpDsquSmma12fDW4H9vs8o51J
https://tribe-neon-kwd0ifcat-kiyoshi-kitamura.vercel.app
Supabase Preview: sufvuqdnqohpfzkwxohq

Guild Emblemは別branch codex/guild-emblem-phase1-20260913（5a5101b2）。本修正はEmblemを含まない。
Cut-in停止位置/透過素材は別残件。解消扱いにしない。

## 修正内容
1. Encounter Room生成
既存通常create_raid_room_v1が利用するraid_room_combat_profilesの難度別HPと、_raid_room_launch_enemy_snapshot_v1を使用。
Raid Boss→Room登録→Combat Snapshot→Encounter CREATEDを同一transactionで行う。
生成失敗時は部分Roomを残さずDRAWNで再試行可能。発生率10%/11回保証/難度重み/報酬2倍を維持。
新Migration: 20260913142410_quest_raid_combat_snapshot.sql。
正常な既存Roomや既配信報酬の書換えを含めない。

2. Snapshot補完後も残る出撃準備エラー
GameContextがsetRaidFirstEntryFreeをProviderへ公開していなかった。
RaidTabでRP確認RPC成功後、このsetter呼出しがTypeErrorとなる。
setter公開を追加。通常Roomにも共通。RP/初回無料/チケットのルール・消費処理は変更しない。
実Providerの公開キーを使うテストで修正前の同一例外を再現し、修正後6ケースPASS。

3. MyPage再案内
再案内をQuest/Raidにしか配置していなかった。
Homeのキャラ下・主要CTAの次、バナーの前に「発見した強敵に挑む」を追加。
上部Headerへの配置ではない。「あとで」確認済みの同じRoomへ戻る。
終了/期限切れ/Roomなし/未確認のentryは再案内対象にしない。
Home表示時に最新状態を再取得。通信中は背面操作・二重実行を防止。

## ローカル確認
- Typecheck PASS
- 変更TS/TSX ESLint 0 errors（既存warningsあり）
- verify-ticket-recovery.mjs：RPあり/初回無料/RP不足/チケットなし/二重回復/通信失敗の6ケースPASS
- verify_encounter_revisit.mjs：同じRoom・確認済み・終了/期限ガードPASS
- Next build：ローカルMock設定でPASS。Vercel実設定Buildとは区別。
- Combat Snapshot：実敵builderを使うPGlite SQL試験PASS（5体/難度別HP/固定/失敗rollback/同じ抽選結果で再試行）。
- 詳細：specs/quest_raid_combat_snapshot_fix_20260913.md。
- 既存不完全Roomの限定修復：supabase/operations/repair_quest_raid_combat_snapshot.sql（明示allowlist、既定ROLLBACK）。
- 旧新宿初級HP32,000,000は通常正本220,000へ合わせる。新規生成は修正済み、既存Roomは未戦闘確認付き個別修復時のみ。

検証コマンド：
node scripts/raid-room/verify-ticket-recovery.mjs
node --experimental-strip-types scripts/verify_encounter_revisit.mjs
npm run typecheck
NEXT_PUBLIC_USE_MOCK_DB=true NEXT_PUBLIC_APP_ENV=development npm run build
Mock指定はローカル専用。配信設定へ転記しない。

## Codex作業順
1. 候補を独立作業フォルダへ取得し、差分とSupabase接続先を確認。
2. 新Snapshot Migrationの既存履歴を確認し、未適用の場合だけPreview適用。旧Migrationは再適用しない。
3. 新規Encounter生成でSnapshot同時作成を確認する。既存不完全Roomの再利用が必要な場合は、別途同梱の対象限定修復手順に従う。通常Room/戦闘済みRoomを一括補完しない。
4. NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=trueをDeployment限定で保持し、専用Previewへ配信。
5. Encounter→出撃準備→編成→Battle→Result→救援→Clear/Rescue報酬2倍→Present受取→Reload後の再受取拒否。
6. 通常Roomの出撃準備・Battleも回帰。通常報酬が2倍にならないこと。
7. あとで→HomeのCTA→同じRoom。Quest/Raid再案内、期限切れ/撃破済み表示も確認。
8. 実画面・SQL・ローカルテストを分けて返す。実iPhone Safari未確認なら明記。

## Billingは別Blocker
ユーザー提供のCodex監査でBILLING_CONFIG_INVALIDと確定。
既存のBILLING_MODE=sandbox、Preview DB、ServiceRoleを保持し、Codex側で下記不足を設定する。
- BILLING_SANDBOX_ENABLED=true
- STRIPE_SECRET_KEY：Stripeテストキー
- STRIPE_WEBHOOK_SECRET：当該テストWebhook署名secret
- BILLING_RETURN_ORIGIN：固定Preview origin
Webhook /api/billing/webhook、Checkout成功/非同期成功/expiredイベント。
既存の安全な設定元から利用する。秘密値をチャット・Repositoryへ出さない。Plugin追加接続は依頼しない。

available:true / mode:sandbox / catalogVersion:20260913 確認後にテスト決済。
ビギナー100円、DIA1,030（有償1,000/無償30）、Webhook重複、取消/拒否、戻り/Reload、120日期限継承、Special抽選/交換を確認する。
キーが既存環境に存在しなければ「Stripeテストキー未提供」等の不足を具体的に返す。設定未完了を実装FAILや決済PASSに読み替えない。

## 判定
本作業ではLive DB、Vercel設定、Production、共有aliasを変更していない。
本候補の配信・再検証依頼は可能。Production反映・ユーザー一括実機確認依頼は、Raid一連とBilling決済の実画面受入まで保留。
報告：SHA/Deployment/URL/DB/適用Migration/各PASS・FAIL・未検証/実機依頼可否。

