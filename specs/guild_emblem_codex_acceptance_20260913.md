# Guild Emblem 初版：Codex配信・受入依頼
2026-09-13 / IMPLEMENTED・Preview受入前

## 対象
Repository: kiyoshikitamura/tribe-neon
Branch: codex/guild-emblem-phase1-20260913
差分base: 9505f2fdc7111386f8768e8f6b9ee13e00bd41fd
現在の課金統合候補とは独立。9/15課金公開をEmblem待ちにしない。

## 実装
- Standard8種：王冠・翼・稲妻・薔薇・双剣・炎・月・蛇。無料、能力効果なし。
- Guild Headerから変更Dialog、一覧→選択Preview→このエンブレムに変更。
- Master/Sub Masterのみ変更。Guild所有、active、期限をServer判定。Standardの所有行は作らない。
- Guild設立は既存create_guild_v2本体を変更せずINSERT triggerでDefault装着。
- 旧equip RPCからの権限迂回を閉じ、背景/バナーのMaster限定は維持。
- 共通GuildIdentity/GuildEmblem。Guild IDを100件単位で一括取得、60秒cache。
- 自身の変更後は再取得をawaitしてからDialogを閉じる。保存後の表示更新失敗は保存を再送せず再取得だけ再試行。
- 他ユーザーの変更はcache期限後の再表示/ブラウザー復帰で反映。常時ポーリングなし。
- 古いレスポンスが変更後の画像を巻き戻さない。

## 表示の接続範囲
Guild Header/検索/Member、公開Guild詳細、Header所属、公開Userプロフィール、個人/Guild Ranking、Activity、Chat/BBS、Raid TOP挑戦者所属、Raid参加者、旧RaidおすすめGuild。
PvP対戦相手の所属は既存の公開Userプロフィール経由で共通表示。対戦相手選択カードには元々Guild名表示がないため新しい行は追加していない。
未公開GvG、通知本文中のGuild名文字列は対象外。
S/M/Lは20/28/56px。実モバイル表示で最終受入する。

## DB
未適用Migration：
supabase/migrations/20260913133311_guild_emblem_standard_identity.sql

新Tableなし。既存cosmetic_master / guild_cosmetics / guild_equipped_cosmetics利用。
追加RPC list_guild_emblems / get_guild_emblems / set_guild_emblem、equip_guild_cosmetic補強、Guild INSERT trigger。
Default01は通常素材が取得不能の場合のSYSTEM placeholderも兼ねる。active=falseの素材は変更選択/有効装着として採用しない。fallback画像を表示することは所有/装着の付与ではない。
既存独自logoは未選択Guildのfallbackとして保持し、破壊しない。

## 確認済み
- Typecheck PASS
- 変更ファイルESLint 0 errors（warningsあり）
- キャッシュ試験PASS：batch/dedup/TTL/保存と旧応答の競合/取得失敗時の最後の画像保持
- PGlite実SQL PASS：設立料金/default、8種、Role拒否、所有/active/期限、旧RPC迂回、背景権限保全、脱退後Guild所有保持
- Preview DB READ ONLYでmaster列/default/制約とseed互換、ID衝突なし
- SVG8種をレンダリングして目視確認
- Next buildはMock設定でPASS。実Supabase設定なしの通常buildは/auth/callback prerenderで停止したため、Vercel本設定のBuild PASSには数えない。

試験：
node --experimental-strip-types scripts/guild/test_emblem_cache.mjs
PGLITE_MODULE=<PGlite module path> node scripts/guild/test_emblem_authority.mjs
npm run typecheck
NEXT_PUBLIC_USE_MOCK_DB=true NEXT_PUBLIC_APP_ENV=development npm run build
最後のMock指定はローカル検証専用。Vercelへ設定しない。

## Codexへの依頼
1. 差分baseから本branchを取得し、最新課金/Raid候補との競合を確認。必要差分のみ統合。
2. Supabase接続先sufvuqdnqohpfzkwxohqを確認。既存履歴に同Migrationがないことを確認してPreviewに適用。
3. 専用Previewを実設定（Mock無効）で配信。既存Raid Roomフラグ・課金Sandbox設定を保持。
4. Master/Sub Masterで変更→Header/一覧/他User/Ranking/Raid/Socialへ反映→Reload。
5. 一般Member・別Guild・未所属の変更拒否、無効/未所有ID拒否を実RPCで確認。
6. 別QAの同Guild表示、長いGuild名、320/390幅、Dialog操作中背面操作不可、キャンセル変更なし。
7. Guild設立/加入/脱退、通常Cosmetic、課金/Raidの影響範囲回帰。
8. 素材の実サイズと変更操作が確認できるPreviewをユーザーへ提示。

Preview/Production DB・Vercel設定への書込みは本実装作業では行っていない。
Vercel Git連携の自動配信が発生しても、実設定・Migration・実画面未確認のため受入済みと扱わない。
Production反映・共有alias変更はこの依頼に含めない。
返却：配信SHA/Deployment ID/URL/DB ref/Build/実画面PASS・FAIL・未検証/ユーザー実機依頼可否。

