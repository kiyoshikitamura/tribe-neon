# 独立検証 C

対象はローカル候補のみ。外部DBへの接続・適用・Deployは行わない。

## 参照関係と変更前

変更前の実効28組は、7件の `canonical_raid_variants` を各4難度が共用する構造。共有HP/ATK/DEF/SPDと5名のCharacter IDはArea単位で同一。敵Skillは共通 `canonical_quest_enemy_pool_entries` のHARD設定を優先し、該当なしは専用Skill、汎用Skillの順に参照。敵装備は空配列固定だった。

変更後はRaid Room専用28Profileと作成時の敵Snapshotに限定して設定を保持する。共通Character/Equipment/Skill/Quest poolは参照のみで更新しない。作成済みRoomは作成時の敵Snapshotを維持する。

`validation-baseline.json` に変更前28組、候補public-settings、報酬master全文、既存352ファイルのSHA256を保存した。これはrepository候補の抽出であり、現在の外部DB実測とは称さない。旧監査Damageは読み込んでいない。

## 固定境界

参加Powerは初級NULL、中級160,000、上級200,000、超級240,000。現候補の救援必要戦数・Damage閾値、CLEAR閾値はNULL、報酬配布enabledはfalse。旧提案数値を実設定と混同しない。Roomは旧PROGRESS/daily/Guild報酬経路から分離されており、別の有効な累積Damage報酬はこの候補に設定されていない。

## 検証方法

- `node scripts/raid-room/verify-launch-balance.mjs`：28組の網羅、実在参照、5人重複、装備category/所有者/育成上限、Skill専用所有者/枠、名称/Power維持、既存352ファイル不変。
- `node scripts/raid-room/verify-launch-balance-pg.mjs`：ローカルPGliteの空DBへ既存test fixtureと実SQLを構築し、追加SQLを適用。28組の実create/start RPCからHPと敵Snapshotを取得。実SQLで装備statsを算出し比較入力と照合。共通master行・報酬行・非対象関数body/ACLの不変、後からのProfile編集が作成済Roomへ影響しないことを確認。
- `node --test tests/db/raid-room-rescue-rewards.test.mjs tests/db/raid-room-entry.test.mjs tests/db/raid-room-finalization.test.mjs`：47/47 PASS。参加Power境界、20人上限、無料/RP消費、Replay同request再送、raw/applied clipping、他モード隔離、救援AND・二重配布防止を検証した。これは既存境界の回帰試験であり、新SQL適用後28組検証は上記別harnessで行う。

PGliteには `RAID_TEST_RUNTIME` をローカル `@electric-sql/pglite` packageのあるdirectoryへ指定する。実行環境はPGlite 0.5.8 / PostgreSQL 18.3。AuthはGUC参照、所有プレイヤーSnapshotと総合力は明示的fixtureであり、外部Auth/HTTP/同時接続を検証していない。プレイヤー育成は独立戦闘計算の記録を参照する。

## 発見と修正

初回構造検証で4Skillの敵の覚醒0（標準Skill枠3）を検出。上級・超級の覚醒表記を1へ修正した。Raid敵の基礎能力は専用値であり通常Character成長から再計算しない。

SQL数値精度の検証で、Lv15/+1装備を持つ比較用上級5名のHPがJS入力で1ずつ大きいことを検出した。`validation-exact-equipment.json` は今回の全敵・全比較編成の装備を現SQLで計算した値。共通Formulaを変更せず、分析入力にSQL値を使って再測定する。

最終の成否・件数と敵実Snapshotは `validation-structure.json`、`validation-pg.json`、`validation-player-equipment.json` を参照する。
