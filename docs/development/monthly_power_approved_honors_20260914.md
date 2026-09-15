# Season報酬 承認事項の実装候補

基準9eb5083。ユーザー承認：新規ID登録／現在の連続在籍7日だけを採用。Production操作なし。本書は親レビュー前、恒久適用前の引渡し記録。

- POWER5段階、GUILD_POWER4段階を16個の正式Cosmetic IDへ接続。数量・順位帯・CASH/DIAは既存確定表から変更なし。
- POWERの称号3件は既存title_master／user_titlesへ同IDを登録・付与。選択authorityはusers.title_equipped／equip_owned_titleを維持。既存選択は自動上書きしない。
- その他はuser_cosmetics／guild_cosmeticsへ付与。Guild所属7日条件は個人向けItemだけに適用。Guild自体への栄誉は所属日数に依存しない。終了時Member全員へGuild栄誉の通知receiptを固定。
- 現在のmembership joined_atからJST加入日Day1で計算、Season開始でclip。再加入前の履歴は累積しない。新規run defaultをCONTINUOUS_JST_DAY1に設定。
- 完全finalizerは固定snapshot→Item→honor→receipt→granted_at／CLOSEDを同一transactionで実施。Season行lockと各ledger主キーで再送防止。全16IDを固定Authorityと照合し、部分欠落も拒否。
- 新API get_equipped_season_honorsは選択済み公開装飾のみ返却。称号はusers.title_equippedのみ読取。所有一覧を他人へ公開しない。
- 既存equip_guild_cosmetic／set_guild_emblemは変更なし。新Emblemも既存set_guild_emblemのMaster/Submaster権限・logo_icon同期を使用。
- Champion Emblemは承認済みrank1画像、TOP3は既存の中立王冠SVGを使用。他栄誉はUIの文字装飾表示。新規専用イラストを制作済みとは扱わない。
- finalize_due_monthly_power_seasons_v1は定義のみ。cron追加、実Season開始、次Season作成、実配布はしていない。終了時の運営runner接続は別工程。

## 検証

Preview sufvuqdnqohpfzkwxohqに候補DDL＋tests/db/monthly_power_approved_honors_rollback.sqlを同一transactionで実行しROLLBACK：PASS。

- 部分binding欠落拒否。
- 故意のCosmetic所有書込み失敗で既存Item付与・snapshot・ledgerもrollback。
- POWER／Guildの実snapshotから正式finalizer完了、再送追加0。
- 既存title所有への付与。
- 6日／7日のJST境界、7日未満Item対象外、終了snapshot後脱退の受領権維持。
- 通知COSMETIC種別、Present増加0、authenticatedからfinalizer実行不可。

複数同時session競合と実UI操作の最終確認は未実施。UI担当変更と親側Buildに統合する。

親側後続: Preview恒久適用・適用後読取確認済み。実versionはformal_open_approved_decisions_20260914.md参照。本文の未適用は子担当引渡し時点。Season実切替・実配布なし。
