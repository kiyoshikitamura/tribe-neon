# 告知・バナー・Activity本番反映

反映日: 2026-09-10 JST。ユーザーの「こちらも本番に反映してください」に基づき実施。Raid親担当から単一実行担当を引継ぎ、重複配信なし。

- URL: https://www.tribe-neon.com/
- 配信source SHA: `258499531c72c175e14472ffddd74b3e183d61a8`
- Deployment: `dpl_3GE4qdMNCgCCf4eyDT4QKsjVTYhP`
- 固定URL: https://tribe-neon-a38l3be42-kiyoshi-kitamura.vercel.app
- 基準: `7e170676a59f464aa55faa708db7bb42e1bec425`。Raid UI・救援ダイアログ・RP回復・結果表示・Headerを包含し、付帯差分だけcherry-pick。
- Production環境でfresh remote build。Mock=false、QA=false、Room=true、APP_ENV=production。ローカル.env/outputs/node_modules/.nextを配信しない。
- www/apexのみalias setで切替。その他73 alias（KPI含む）は前後一致。www200、新Deployment ID一致、apex308→wwwを確認。

## DBと告知

対象 `ktpolnkyyfkowxdmijww`、既存target guard PASS。

1. `20260909163114_release_news_foundation.sql` 単独適用。事前にnews不在・通知0件を確認。RLS有効、Published本文だけを公開。
2. `20260909181921_activity_actor_visibility.sql` 単独適用。元関数定義が監査版と一致することを確認。履歴とKPI分類は不変。
3. `banner-prepare.sql` で非表示準備。配信確認後active=true、end_at=NULL。
4. `release.mjs` が生成するSQLでnews公開とSystem投稿を同一transactionで実行。公開日時はRaid公開連絡時刻 `2026-09-10T02:56:00+09:00` に合わせた。

- News ID: `1`、release_key: `raid_release_announcement_20260909`、Published=true。指定タイトル・本文をDBと公開REST APIで全文一致確認。
- System Message ID: `d0718b02-2747-54c6-a3ff-d517011a9a34`、1件。本文「お知らせが更新されました。」、GLOBAL/is_system=true、user_id/author_id=NULL。
- 送信時刻: `2026-09-10 04:01:41 JST`。再送はしていない。固定ID・transaction lockによる冪等実装を保持。
- バナー `raid_battle_major_update`: active=true、destination=raid。提供画像の配信SHA256一致。現在のキャンペーン2枚への末尾追加で計3枚。
- Activity: authenticated DB roleで既存RPCを実行し7件、削除済actorの表示0件を確認。名前文字列だけでの除外なし。
- KPI/Raid/battleの既存関数定義とACLの集合hashは適用前後一致。Edge/Cron/報酬・ユーザー資源は変更なし。

## 検証の範囲

隔離PostgreSQLの公開/rollback/再実行/権限/Activity除外と、実コンポーネント由来のPC Chromium/Mobile WebKit検証を最新基準上で再実行しPASS。Vercel Production build READY。配信JSでProduction接続・バナー追加・RP回復/Header保持を確認。Production Auth settings200。

公開APIでnews・bannerを取得。board_postsは匿名APIに対して401（既存の認証要求）なので権限を変更せず、authenticated DB roleで1件をreadbackした。Activity確認もDB認証contextによるread-only検証であり、実ユーザーのAuthセッションを使った画面操作ではない。

ログイン済み実ユーザーによる本番一覧→詳細、3枚rotation→Raid→戻るの画面操作は今回未実施。検証用の本番QAユーザー作成や戦闘・資源消費は行っていない。既存セッションはページ再読込み/お知らせ開き直しで最新表示を取得する。

各JSONは秘密情報を含まない適用・readback証跡。ローカル作業ツリーの後続docs commitは配信SHAとは別。
