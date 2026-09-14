# Billing前の残2項目：Codex差分検証

ユーザー指示によりBillingは最後。今回は設定・Checkoutを実行しない。
基準アプリ `7105b05fcbd2f0db7e37c85e864935a3328ac5d3` のRaid専用会話Acceptanceは継承する。

## 1. Reduced Motion

既存CSSはreduce時に移動アニメーションを停止する。専用台詞の位相はReactタイマーで管理し、装備帯の終了境界のみCSSで保持する構造。実メディア設定での確認が必要。

専用設定ファイルとテストを追加した。CodexのPlaywrightで実行：

```powershell
$env:ACCEPTANCE_BASE_URL="https://tribe-neon-oojkvryp4-kiyoshi-kitamura.vercel.app"
npx playwright test --config tests/acceptance/motion-social.config.ts
```

- `reducedMotion: reduce`を指定し、matchMediaのtrueを先に検証する。
- 装備帯／台詞／Cut-inの停止・2.2秒保持・再開を確認。
- Cut-inの移動アニメーション抑制と、SKIPなしResult到達を確認。
- Replay indexまたは画面状態が20秒間変化しない場合は停止FAIL。自然終了の監視上限は300秒、ケース全体は360秒とする。これはテストを有限に保つ上限であり、製品の戦闘時間仕様ではない。
- これはQAハーネスのメディア設定テスト。実機OS設定による確認や実Raidの検証とは区別する。
- ブラウザー実行権限や環境にこのAPIがなければ、許可された別の検証環境で実行する。アプリDOMへCSSを注入してPASS扱いにしない。
- テストの実行結果は本書作成時点で未取得。タイムアウトもPASSに読み替えない。

## 2. Emblem Chat／Activity

Repository確認結果：全体Chat・Guild ChatはTribeChatModal→UserIdentityRow→GuildIdentity、ActivityはHomeTabの最新行と履歴→同共通Componentへ接続済み。
画像はguild_idから取得するため、Guild名だけのFixtureでは保存Emblemの一致を確認できない。

既存のPreview QA Guild「統合エンブレム検証隊」、保存値「月 / guild_standard_07」を優先使用する。
既存QA投稿・既存救援Activityを探して以下を確認する。新規投稿の送信は今回の作業には含めない。

| 画面 | 再現条件 | 期待 |
| --- | --- | --- |
| 全体Chat | 対象Guild所属QAの既存発言 | 名前の所属Guild左に月Emblem |
| Guild Chat | 同Guildの既存発言 | Guild名と月Emblem |
| Activity最新行 | 対象Guild所属QAがactorの既存イベント | Guild名と月Emblem。最新行では所属Guild行だけを表示し、Emblemは16px固定 |
| Activity履歴 | 同イベントを履歴で表示 | 最新行と同じGuild・Emblem |

各行でguild_id、guild_name、表示asset pathの対応、画像読込、320px／390pxの見切れを確認。Reload後の保持も確認する。
未所属actorに他GuildのEmblemを表示しない。対象投稿やイベントが存在しない場合は「データ不足」とし、接続済みを実画面PASSへ読み替えない。

QA分類済みactorは通常のActivity取得Authorityから除外されるため、Preview専用の
`first-home-activity-real` scenarioだけが、ログイン済みQAから指定actorの実Activityを直接読み、
本体`HomeTab`の最新行・履歴へ渡す。`actor` queryには実UUIDを指定する。
通常の`get_recent_social_activity_feed`、QA除外、KPI分類は変更しない。

## 報告と公開判定

Reduced Motionと4つのSocial表示面を個別にPASS／FAIL／未検証で報告する。環境不足・データ不足を具体的に記載する。
本候補は検証資材のみでアプリ・DB・環境変数・Production変更なし。既存Previewを再配信せず検証可能。
2項目の完了後にBillingへ戻る。Billing未達の間はProduction公開不可。
