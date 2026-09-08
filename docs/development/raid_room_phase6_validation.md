# Raid第6工程 公開生成SQL検証

2026-09-08 / RAID-C-06 / 子担当結果: IMPLEMENTED（親レビュー待ち）。

## 結果

PGlite 0.5.8 / PostgreSQL 18.3 WASMの一時DBで **20件PASS、0件FAIL**。00250〜00253はRepositoryファイルを無改変で順次適用。生成停止ロック（設定行FOR SHARE）追加後の00253を検証した。

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-creation-run.mjs
```

|対象|確認した結果|
|---|---|
|公開呼出し|SET LOCAL ROLE authenticatedで生成成功。auth.uidの本人がowner、owner参加1人、24時間、参照マスターHPを保持|
|初期停止|default disabledで55000。boss/Room/member書込なし。生成後の停止は既存requestの再送も拒否|
|認証・Lv|認証無し、プロフィール無し、Lv4/NULL拒否、Lv5成功。anon実呼出し拒否|
|総合力|中級160,000・上級200,000・超級240,000の直前拒否、一致/直後成功。非初級のNULL/負power/空編成拒否、初級に総合力制限なし|
|入力|NULL/未知難度、NULL/未知/非公開boss、NULLrequest拒否|
|再送|同一requestは同じRoom、難度/boss変更拒否。他userの同requestは別Room。撃破後再送も元Room|
|開催枠|4難度10/10/10/5まで成功、超過拒否。失敗時に孤立bossなし。期限経過Roomは枠から除外|
|コスト|成功・再送・拒否後の全users行が事前と完全一致。監視用Cash/Diamond/RPカラムも不変|
|権限|settings/request台帳の4ロールCRUD権限なし、authenticatedの直接変更拒否。公開RPCはsecurity definer / pg_catalog固定|
|取消・外部キー|親transaction rollbackでboss/Room/member一括取消。旧boss_master不足時はFKエラーになりboss/Room/requestなし|
|boss候補|is_production_enabledがtrueの候補だけ取得|

20はnode:testのテスト件数。境界入力や35Room生成を別件として加算しない。

## fixtureと限界

- `raid-room-read-projection-fixture.sql` と `raid-room-lifecycle-fixture.sql` を再利用し、`raid-room-creation-fixture.sql` で既存依存を補足。
- 新INSERTに関わる `raid_bosses` のNOT NULLと外部キーは、initial_schema、00146、00210と照合。`boss_master_id→raid_boss_master`、`raid_variant_id→canonical_raid_variants` を保持し、`raid_day_key` は既存どおりtext。
- users/編成/マスターは最小fixtureであり既存schema全体・trigger・role継承を再現していない。Cash/Diamond/RPは書込監視用の最小カラム。
- `auth.uid()` はJWT sub設定から読むdouble。Authサービス、JWT検証、PostgRESTリクエストは未検証。
- `calculate_user_total_power(uuid)` はfixture tableを読むdouble。DB値による判定接続を検証し、キャラ・装備を含む既存総合力公式の再検証は行っていない。
- 真の多接続競合、接続待機後の同時停止、実DB適用、実機、戦闘開始・救援・報酬接続は未検証。
- 公開設定を有効化するのはfixture transaction内だけ。Production/Preview DB操作・deployはなし。

生成APIの機械検証であり、プレイヤーが戦闘・報酬まで遊べる到達点や全体開発完了ではない。
