# Guild Emblem DB 差分検証

2026-09-13 / ローカルSQL検証PASS・Preview未適用

## 実装
- `20260913133311_guild_emblem_standard_identity.sql`。Supabase CLI 2.81.3 `migration new` で作成。
- 既存cosmetic_master／guild_cosmetics／guild_equipped_cosmeticsを再利用。新Tableなし。
- Standard8種（王冠、翼、稲妻、薔薇、双剣、炎、月、蛇）。Standard所有行の大量生成なし。
- `set_guild_emblem(uuid,text)`：Master/Sub Master。認証、所属、解散、active、Guild所有/期限を確認。
- `list_guild_emblems(uuid)`：所属者向け利用可能一覧。
- `get_guild_emblems(uuid[])`：認証者向け公開Guild表示projection。最大500 IDs。重複IDは1件にまとめる。
- 既存equip_guild_cosmeticのEmblem slotは新RPCへ委譲。背景等は引き続きMasterのみ。NULL非所属とinactiveを拒否。
- Guild INSERT後triggerで同一transactionのDefault装着。create_guild_v2本体は変更せず、現行料金・Lv・MissionのAuthorityを保全。
- 装着を正本とし、変更時logo_iconを互換同期。選択未登録の既存Guildは独自logo_iconを保持し、なければDefault。期限切れ/無効の装着はDefaultへ戻す。
- new RPCはPUBLIC/anon実行をrevoke。変更trigger直接実行はauthenticatedにも付与しない。既存TableのRLS変更なし。

## 実行検証
`PGLITE_MODULE=<PGliteモジュールパス> node scripts/guild/test_emblem_authority.mjs`

PGlite 0.3.7の隔離DBで、関連列のfixture schema、現行create_guild_v2の実SQL、新Migrationの実SQLを実行。
以下PASS：
- Lv5/1000 CASHでGuild作成、500 CASH控除、Default装着、Standard所有行0。
- Master/Sub Master変更、logo_icon同期、8件一覧、batch重複排除。
- Member/非所属/未認証/脱退後の変更拒否。旧equip迂回も拒否。
- 不正ID/異なるslot/inactive/未所有/期限切れ拒否。期限内Guild所有は成功。
- 限定装着失効時Default。既存独自logo/defaultの両fallback。
- 背景はSub Master/非所属拒否、Master成功。
- 脱退後もGuild所有が残る。解散Guildは変更拒否・公開projection対象外。
- anon RPC権限なし、trigger直接実行権限なし。

## 未検証／配信担当へ
- Live Preview Migration適用、実Role/JWT下のRPC、実際の画面変更・Reload・他ユーザー表示。
- 同時脱退/Role変更との競合。Guild→Memberの既存ロック順序に合わせて実装。
- Productionの適用前差分。未選択の旧logoは消去しない。

Supabase公式Functionドキュメントとchangelogを確認。今回に該当する破壊的変更なし。認証情報・DBデータは保存していない。Preview/Productionへの書込みは実施していない。

## Preview master schema READ ONLY照合
- 2026-09-13、BEGIN READ ONLY / ROLLBACK。cosmetic_masterの全14列と制約を取得。
- seed省略列：rarity=`COMMON`、expires_enabled=`false`、created_at=`now()`。いずれもNOT NULLだがdefaultあり。preview_key/source_referenceはnullable。
- owner_scope CHECKはUSER/CHARACTER/GUILD。slotに追加制約なし。新8 IDsの衝突0。
- PGlite fixtureを実cosmetic_masterの全列・default・NOT NULL・CHECKへ揃え、同一テスト再実行PASS。

## Default運営ルール提案
`guild_standard_01`は未選択/画像取得失敗/無効装着に使う恒久SYSTEM fallback。01の削除・inactive化・Standard/default metadata除去・asset撤去は初版運用では行わない。02〜08および限定Emblemはactiveで停止可能。01停止を将来必要とする場合は、先に全DB/UIのdefault参照先を移行する。
現実装のfallbackは01固定であり、運営停止機能そのものの追加は今回のScopeにない。この運営ルールの採用判断は親へ引継ぐ。
