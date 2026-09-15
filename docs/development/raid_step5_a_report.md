# 第5工程 A 読取調査

確認日時: 2026-09-09 12:46–12:49 JST。外部は Vercel GET 2件のみ。Git/source/DB/alias変更なし。資格値は出力・記録していない。

## 現在の本番配信

既存 Vercel CLI 認証を使い `/v4/aliases/www.tribe-neon.com` と、その応答の deployment ID を指定した `/v13/deployments/dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx` を新規に読み取った。過去報告や main の推定ではない。

| 項目 | 実応答 |
| --- | --- |
| alias | https://www.tribe-neon.com |
| deployment | dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx |
| deployment URL | https://tribe-neon-nfmjnrpd8-kiyoshi-kitamura.vercel.app |
| Git SHA | 550c02225cbecb6ba6f174ee3fb952bcaae2f6dd |
| Git ref | codex/production-base-battle-top-20260909 |
| target / state | production / READY |
| createdAt / ready | 1788911924490 / 1788911956088 |
| alias updatedAt | 1788912017902 |

## Character 固定候補

読取元: `C:/Users/Kiyoshi Kitamura/Documents/Codex/2026-09-09/codex-game03-tribe-neon-ux-party/tribe-neon-audit`。対象タスク `01a08202-10b3-7ee3-93e9-f255767f24ca` の履歴とローカル確定コミット・提出レポートを照合した。

確定チェーン:

1. 本番 `550c02225cbecb6ba6f174ee3fb952bcaae2f6dd`
2. Character同期 `0ef8a56775c3878e4856176fb8c2d157f59d8a6d`
3. 仮初期装備修正 `1a38636a4d8d24ce948b1467f4da974cb17cdb3d`

0ef8a56 は CharacterHome.tsx/.css、CharacterSystemV2.tsx/.css、characterHomeSelection.ts、Character test 2本、説明1本。Character STEP2 source は `4b9ecf78b9d6c80cbec6a326297eed707f29cb9c`。本番の Setup/Gacha/Battle/Result/PvP/Raid/Quest/Tutorial/Context を優先して移植済み。

1a38636 は GameContext.tsx の初期装備投影のみの製品修正と、verify_initial_equipment_state.mjs、m9-tutorial.spec.ts、説明1本。DB保存errorまたはreturned rowなしを所持装備へ追加しない。空一覧では選択・level・limit break・optionsをクリアし、部分成功では成功行だけを保持する。初期付与内容、計算式、RPC、DB権限は変更しない。

採用案: 本番固定基準に上記2確定コミットの限定差分を取り込み、Raid差分と親担当が統合する。旧 `a02754c98c1d927e36ecdb46d7ac55541828a346` は1a38636の祖先ではない (`git merge-base --is-ancestor` exit1)。共通祖先は `a8c31c49d63caf6f33d4cb783d3456c52e46d23b`。Raid49222deと1a38636も別repoのrev-list集合照合で同じ共通先頭となる。

読取時の Character HEAD は1a38636。現在branch `codex/character-ux-v2-20260909` の未commit CharacterHome.tsx、CharacterSystemV2.tsx、未追跡character-ux-v2.spec.tsは作業中として全て除外する。新規全面改修を採用済みと扱わない。

## 既存検証の根拠と限界

`../codex-game03-tribe-neon-ux-party/phantom-equipment-acceptance/REPORT.md` と1a38636の `docs/development/phantom-initial-equipment-fix.md` に以下の記録がある。これは過去の検証であり、本候補の再PASSではない。

- bootstrap実コード8ケースPASS、修正前は7FAIL/1PASS。失敗・null・error+data・部分成功・再読込を含む。
- Mock Fresh完走し5保存済み装備とHOME総合力一致。関連browser26、Tutorial2、Fresh1 PASS。
- 実Preview既存ユーザーではDB装備0とHOME0/7、総合力12,495が一致。修正前は仮5/7、17,145。再読込でも一致。
- 実Preview Freshの初期装備保存はHTTP403/42501のまま。修正後は仮所持を表示せず空枠。保存成功や実Fresh完走は未達。

本候補ではC/親による再実行が必要。Aは読取のみでテスト・実ユーザー進行・DB書込を行っていない。

## 配信SHAと独立した本番DB修正

読取元 `../game03-tribe-neon-production-pvp-opponent/repo`、確定コミット `2b24b11f8e64f27391e5e09c09002c93ed7221e8` は550c022直子。製品差分は `supabase/migrations/20260909003245_pvp_opponents_power_multiply_bigint.sql` のみで、他18ファイルは検証資料。

get_pvp_opponents_page の2箇所で乗算前 `coalesce(power.total_power,0)::bigint*10000` とする。選択条件・倍率・権限は保持。旧/新関数定義MD5を許可するguardあり。ファイルSHA-256は `4e0cf4f2c0af2a0147f570db36e0fe8b5a9db560cda335eb9c7e6b85f88b5273`。

当該repoの `docs/verification/pvp-overflow/report.md` は、Production履歴20260909003245、Preview履歴20260909002512、両方の修正後関数MD5 `636f7e768a3a554ba2b4a7f02f4bf372` を記録している。Production DBは既存適用記録であり、Aが今回ライブDBを再確認したものではない。Bは本工程のPreview実SELECTで同MD5と、list_migrations内20260909002512 pvp_opponents_power_multiply_bigint（全277履歴）を再確認した旨報告した。

採用案: 本番反映済みDB canonicalのmigrationを限定保持し、同名・別履歴番号の二重適用を避ける。アプリ配信SHAは550c022のままなので、DB修正コミットを「本番配信SHA」と呼ばない。検証資料一式の無条件取り込みは不要。

## 未確認

本統合候補の型・build・回帰・画面受入は親/Cの後続作業。Previewの現履歴・DB実定義はB担当。Fresh実DB初期装備保存の権限問題は残件であり、状態表示修正で保存成功へ読み替えない。
