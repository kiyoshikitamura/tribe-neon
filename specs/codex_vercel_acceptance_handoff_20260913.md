# CodexへのVercel検証引継ぎ（2026-09-13）

## 担当と対象
ユーザー指示：Vercel検証はCodexへ渡す運用。追加のPlugin接続依頼は不要。
この文書は検証依頼であり、Production公開依頼ではない。

- Repository: kiyoshikitamura/tribe-neon
- Branch: codex/formal-release-integration-20260913
- アプリ候補SHA: 63e43b76adaf880e5569526ba52558c0aae0e68b
- 候補Preview: https://tribe-neon-h2fhhosba-kiyoshi-kitamura.vercel.app
- Preview Supabase: sufvuqdnqohpfzkwxohq
- Production、共有alias、Production DBは変更しない。
- 既存Migrationは適用履歴と名前を確認し、再適用しない。
- この引継ぎ文書の追加コミットはアプリ候補とは区別する。

## 1. Raid Room UIのビルド設定と再配信（現在のBlocker）
実画面確認元は3dd18caのPreview：
https://tribe-neon-1qhzjkpal-kiyoshi-kitamura.vercel.app

Quest勝利→通常報酬Result→次へ→Encounter表示・報酬2倍表示・Room新規開催まではPASS。
「今すぐ挑む」で旧Raid画面の「現在開催中のレイドはありません」が表示され、入室以降は未完了。

コード根拠：
src/app/components/RaidTab.tsx は NEXT_PUBLIC_RAID_ROOM_UI_ENABLED === 'true' の場合のみRoom UIをマウント。
フラグ無効時はRoomのreturnTargetが表示に使用されない。
get_raid_room_v1による対象Room取得は成功し、Roomはactive。DB開催失敗ではない。

依頼：
1. 専用Previewの当該ビルド環境変数を確認。最新候補でも確認し、値が欠けている場合は専用Previewの適用範囲でtrueにする。
2. NEXT_PUBLIC値はビルド時に埋め込まれるため再配信する。コードでフラグを迂回しない。
3. 配信SHA、Deployment ID、immutable URL、Preview DB接続先、READY/HTTP200を返す。
4. Encounter「今すぐ挑む」→Room→準備→Battle→救援→報酬→Reload後の二重受取不可を実画面で確認。
5. 「あとで」→MyPage再案内→同じRoom、期限切れ/撃破済みの場合の表示も確認。

QA補足：
遭遇QA913はKPI除外済み。保証境界確認のためmisses=10を準備したQAであり、自然に10回連続未遭遇を実画面検証した意味ではない。
Room ID: d0157985-a2d7-45bb-b887-7e377c9b4eed
Preview Encounter設定はenabled=true。現時点でユーザー実機確認を依頼しない。

確定仕様：初回保証なし、10%、10回連続未遭遇後の11回目保証、初級/中級/上級の重み50/35/15、EncounterのClear/Rescue報酬それぞれ2倍。
実DBの2倍付与・再実行追加付与なし・配送失敗時rollbackは別途PASS。詳細：
specs/raid_encounter_preview_sql_acceptance_20260913.md
SQL検証を実画面のRaid完了PASSと混同しない。

## 2. 課金SandboxのVercel設定と決済検証
3dd18caの /api/billing/config はHTTP200、available:false。
Previewの商品4pack＋DIA6商品はREAD ONLY照合PASS。ただし配信APIのServiceRole疎通を証明するものではない。
環境不足、設定不一致、配信APIのDB照会失敗のどれかは未特定。まず既存設定とサーバーログで切り分ける。

必要条件：
- BILLING_MODE=sandbox
- BILLING_SANDBOX_ENABLED=true
- VERCEL_ENV=preview（Vercel管理）
- NEXT_PUBLIC_SUPABASE_URL=https://sufvuqdnqohpfzkwxohq.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=当該Preview用の既存サーバーキー
- STRIPE_SECRET_KEY=テストキー
- STRIPE_WEBHOOK_SECRET=当該テストWebhookの署名secret
- BILLING_RETURN_ORIGIN=使用する固定Preview HTTPS origin
- Webhook=/api/billing/webhook
- イベント=checkout.session.completed / checkout.session.async_payment_succeeded / checkout.session.expired

既存キーと設定を再利用する。秘密値を報告・Repository保存しない。
配信環境で node scripts/billing/check_sandbox_environment.mjs --remote-catalog を実行。
available:true / mode:sandbox / catalogVersion:20260913 を確認してから決済へ進む。

テスト：
- ビギナー100円：テスト決済→戻り→Present受取→数量/購入回数/120日期限。
- DIA1,030：有償1,000＋無償30、期限の分離、受取で期限延長なし。
- Webhook重複と戻り画面の競合：配送1回、Reloadで再付与なし。
- 取消/拒否：付与なし。成功後の古いexpiredイベントで降格しない。
- CASH/回復アイテム交換：元の期限継承、再送時の追加消費なし。
- 各Specialカテゴリ：DIA/チケット、1回/10連、演出/取得、追加保証・割引なし、Pt保持と100Pt交換。
- 実iPhone SafariのCheckout復帰はブラウザー相当検証と分けて報告。

詳細：specs/billing_preview_acceptance_20260913.md
同文書の「接続を用意する」は本引継ぎによるCodex側の既存実行環境で対応する。ユーザーへのPlugin追加接続依頼は行わない。

## 3. 別管理の残件
- 専用演出QAのcutin停止位置：CSSとJSタイマー差による停止位置FAIL。全HP/カーソル保持は確認され、実戦効果先行が発生したとの判定ではない。
- 装備帯5名の顔・目元表示、pause保持はQAで確認。実際の抽選→装備→全戦闘種別を完了した意味ではない。
- WEAPON_047 / WEAPON_049 / HEAD_020 の透過素材は未解消。
これらをVercel設定修正だけで解消した扱いにしない。

## 返却形式
配信SHA / Deployment ID / URL / DB接続先 / 設定名と適用範囲（秘密値なし）。
各項目を実画面PASS・SQL/コードPASS・FAIL・未検証に分ける。
Production可否と、ユーザー実機確認依頼の可否を明記する。
