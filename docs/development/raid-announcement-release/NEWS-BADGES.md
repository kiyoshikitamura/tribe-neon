# お知らせ未読バッジ 本番反映

- Source: `6d1385100bcd7e1b53fa0bcb9099adcd87065740`
- Deployment: `dpl_ELyWCqKWov4At2Yyd5drKV2DTb3i`
- URL: https://www.tribe-neon.com/
- 確認時刻: 2026-09-10 04:11 JST
- 直前本番2584995とRaidの7e170676/RP回復/結果/Headerを保持。

MENUには未受取プレゼント＋未読お知らせの合計、お知らせボタンには未読お知らせ件数を表示。一覧を開いただけでは既読にせず、各詳細を開いた時に既読化。タイトル/本文が変わった場合は再び未読になる。公開newsを初回・60秒ごと・画面復帰時に取得。RLSで非公開/期間外は対象外。

既読はlocalStorageのアカウント別キーで保持。同じブラウザの別タブと同期する。別端末/ブラウザやstorage消去時は未読へ戻る。storage不可時はメモリ内で保持。DB変更・通知再送なし。

実Header/InboxPanel/未読hookでPC Chromium、Mobile WebKit 390×844・320×568を検証。両バッジ、一覧で維持、詳細で消去、プレゼント残存、未受取なしでMENUバッジ消去、再読み込み保持、アカウント分離、本文更新で復活をPASS。人物行とAPI/Contextはfixture。既存Inbox表示回帰もPASS。

型・hook lint PASS。Production build READY、配信JSでbadgeコード・RP回復/Header・Production Auth/API接続を確認。www200と配信ID一致、apex308、他73 alias不変。System通知は元の1件のまま。実ユーザーの本番Authセッションを使う画面操作は行っていない。
