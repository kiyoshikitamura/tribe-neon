# 専用テストユーザー・Guild作成手順（未実行）

対象はPreview `sufvuqdnqohpfzkwxohq`。主催者・通常参加者・救援参加者を新規3件作成する。既存19ユーザーのID、資格情報、所持品を流用しない。役割はゲーム内のテスト分担であり、Authのadmin権限は付与しない。

|役割|名前案（8文字以内）|Guild|参加経路|
|---|---|---|---|
|主催者|R0908H01|新規R0908Guild01のMASTER|Room作成|
|通常参加者|R0908N01|同GuildのMEMBER|通常参加登録。救援へ後付け変更しない|
|救援参加者|R0908R01|同GuildのMEMBER|未参加RoomのGuild救援リンクから最初に参加|

名前重複時は末尾を変え、新規作成を続ける。既存名のユーザーへログインしない。全体Activity経由の救援は別の新規Roomで同じ救援ユーザーを使える。Guild移籍検証には追加の専用Guild（別の新規主催者）を用意するか、通常参加者が独立設立する段階を別runに分ける。

## 作成と準備

1. 作成直前のUTC/JST時刻をrun manifestへ保存。3つの独立したブラウザprofileを用意する。対象URLの配信SHA・Supabase ref・Mock無効を確認する。既存sessionがない状態で、それぞれ通常のTAP TO STARTを使い新規匿名Authを作る。
2. Auth UUID・作成時刻を各profileに対応付けて秘密情報を含まないローカルmanifestへ記録する。3 IDの相違と今回の作成時刻以後であることを管理接続のSELECTで確認する。メール・パスワード・JWT・refresh tokenはRepositoryへ記録しない。
3. 名前を入力し通常の初期化を完了する。実UIは `initialize_current_player(p_username,p_invite_code)`（招待コードNULL）を呼ぶ。現Previewの1引数正本は **匿名sessionを必須** とするため、Admin createUserでメールユーザーを先に作り、ゲーム初期化済みと扱う手順は採用しない。`initialize_new_user(uuid,text)` はsuccessを返すだけの旧関数なので使わない。
4. `public.users` と `kpi_subjects` が各IDに1件できたことを確認し、[06-test-account-classification.psql](06-test-account-classification.psql) で今回の3 IDだけをQA分類する。`valid_from=registered_at` とし、初回Game Startからの除外を確認する。最初の作成から分類までの間にKPIの定期保存が走る可能性はあるため、その時間帯の保存結果はQA分類前として記録する。KPIのraw factや保存結果を削除・手動再集計しない。
5. 各profileで通常チュートリアルを完了し、Lv5以上、所有キャラクター1〜5体の実出撃編成、RP残量を確認する。必要なCashは通常進行で確保し、主催者は500以上を持つ。ユーザー経済列の直接UPDATEやマスター値の変更で準備済みを偽装しない。高難度境界の合成データは別の限定fixture案として切り出し、初級の実経路確認と区別する。
6. 長期利用・別端末検証が必要なら、ゲームの正規アカウント連携導線で匿名ユーザーを継続可能なアカウントへ変換し、Auth UUIDが維持されることを確認する。資格情報は担当者の秘密管理へ保存する。匿名のままの場合はprofileを消さず、未完了onboardingの24時間cleanup対象にならないことを確認する。cleanup Cronを止めない。
7. 主催者sessionでGuild設立を行う。実RPCは `create_guild_v2(p_user_id=host UUID,p_guild_name='R0908Guild01',p_creation_cost=500)`。現定義は本人認証、Lv5、Cash500、未所属、名前1〜12文字・重複を検査する。返却 `guild_id` を保存し、Cashが500だけ減り `guild_members.role='MASTER'`、`guilds.recruitment_mode='OPEN_JOIN'` になったことを確認する。
8. 通常・救援sessionから `join_guild(p_guild_id)` またはUIで加入する。各人1所属・同Guild・MEMBER、KPIのmembership periodが生成されていることを確認する。旧 `create_guild` や直接INSERTでGuildを作らない。既存の人間参加・Guild生成KPIは発火し、QA分類で分析から除外される。
9. DB→対応Edge→対応UI、別SQLによる期限Cron、承認済み難度・報酬設定が揃った後でRoom操作を有効化する。主催者が初級Roomを作り、通常参加者は通常経路、救援参加者は主催者が公開した救援リンク経路で入る。主催者から両公開先へ各3回、同一request再送、通常参加の救援昇格不可を確認する。

## 記録・後片付け

run manifestにはref、配信/Edge SHA、開始時刻、役割→新規UUID、Guild ID、Room ID、request ID、Replay ID、Present ID、初期Lv/編成/RP/Cash、QA subject ID、テスト結果を記録する。メールやtokenを含むstorageStateをcommitしない。

Guild移籍は現 `join_guild` の24時間再加入cooldownに従う。時刻列の書換えで回避しない。移籍後の旧Guild救援リンクは42501を期待し、期限切れ・別ユーザー・通常参加済みは別Roomで検証する。

終了後は新規Room操作を停止し、開始済みReplayとPresentを処理・照合して専用profileをログアウトする。テスト3ユーザーはQA分類のまま識別して保持できる。削除が別途必要な場合は新規manifestだけに限定し、先にsessionを失効、Guild MASTER移譲/解散条件と参照台帳を確認する。既存19ユーザー、報酬台帳、KPI raw factをcleanup対象にしない。

根拠: [実Auth/Guild/KPI関数](../evidence/raid-room-step2-20260908/test-account-functions.json)、`src/app/context/hooks/useAuth.ts`、`useGuild.ts`（375a0ad）。[Supabase Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) はサーバー専用だが、Auth作成だけで本アプリのonboardingは完了しない。
