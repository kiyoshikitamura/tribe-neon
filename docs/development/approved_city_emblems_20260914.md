# 承認済み街紋章・プレオープン第1位紋章

2026-09-14。親統合候補 9eb5083 に対する追加。Production変更なし。

## 実装

- 既存標準紋章8種のID・画像・選択状態・所持権は変更しない。
- 承認済み新宿／渋谷／池袋／六本木／秋葉原／川崎／横浜PNGを、ファイル名と同じ7つの新規IDで標準紋章登録。既存の標準選択権を利用し、所持行は追加しない。
- プレオープン1位の既存ID `guild_preopen_2026_rank_1` は、Previewでは未配布の `GUILD_DECORATION` プレースホルダー。所持・装備0を確認したうえで、同IDを `GUILD_EMBLEM` に正規化する。名称は「プレオープン第1位限定ギルド紋章」。画像 `/guild-emblems/guild_event_rank1_base.png`。
- 第1位紋章は `standard:false`。通常選択権に含めず、既存の正式授与処理による所持権を必要とする。このmigrationは配布・Season終了を実行しない。
- ID衝突時のowner／slot／画像／標準フラグ不一致は例外で止める。既発行の旧slotを勝手に変更しない。

## 表示経路

`cosmetic_master.asset_key` → `list_guild_emblems` / `get_guild_emblems` の `asset_path` → GuildEmblemEditor / GuildEmblemCache。既存の画像表示経路がPNGにも対応しており、別mapperは不要。ランキングの1位フォールバック名称も「紋章」へ統一。

## 検証

Preview DB `sufvuqdnqohpfzkwxohq` でmigrationを同一transactionへ読み込み、検証後ROLLBACK。

- 標準選択候補が既存8＋新規7＝15件：PASS
- 7種を実 `set_guild_emblem` → `get_guild_emblems` で切替、画像パス一致：PASS
- 未所持の1位紋章は一覧に出ず、装備RPC拒否：PASS
- transaction内のみ所持行を仮作成した1位紋章は装備・PNGパス一致：PASS
- 検証中の装備変更・仮所持は全てROLLBACK。
- `node scripts/guild/test_emblem_cache.mjs`：PASS
- `node scripts/verify_preopen_reward_addendum_contract.mjs`：PASS

これはDB／コード検証。実機の見た目受入は統合Preview工程で行う。恒久適用は親エージェントが実施・記録する。

親側後続: Preview恒久適用・適用後読取確認済み。実versionはformal_open_approved_decisions_20260914.md参照。本文の未適用は子担当引渡し時点。Season実切替・実配布なし。
