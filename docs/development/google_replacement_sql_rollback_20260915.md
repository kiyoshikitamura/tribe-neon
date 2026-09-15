# Googleデータ置き換え SQL検証（2026-09-15）

対象: Preview `sufvuqdnqohpfzkwxohq` のみ。候補DDL・ALTER ROLE・合成fixtureはすべて一つのtransaction内で実行し、ROLLBACKした。Production接続・既存Migration再適用・実ユーザーの削除はしていない。

## 実行結果

2026-09-15 06:36–06:38 UTCごろ、以下10件がPASS。

- service_role以外のretirement拒否
- ledgerおよびretirement関数のservice-only権限
- 未知の参照テーブルがある場合の拒否と原子性
- PvP防衛履歴がある場合の拒否
- DELETEトリガーが失敗したとき、プロフィールとDELETING更新の両方を取り消す
- 基本育成・編成・チュートリアルデータのcascadeと元ゲスト不変
- Authユーザー・identityをSQLでは削除せず公式Admin API段階へ残す
- retirement再試行時のDELETING維持
- 旧UIDをhook関数で拒否、元ゲストとservice_roleを許可
- 実アカウント「テスト1」「ぶっちんぷりぷり」のAuth・identity・プロフィール・全public.users FK参照データのハッシュ不変

独立したREAD ONLY再確認:

- 候補ledgerテーブル: 不存在
- Auth fixture: 0件
- ゲームfixture: 0件
- authenticator pre-request設定: 不存在
- 実アカウント2件: 存在

初回実行はfixture表示名が文字数制約超過のため失敗し全体rollback。短縮後の2回目が10件PASS。失敗をPASSに算入していない。

## 修正

個人の所持品・編成・チュートリアル・表示設定・通常育成状態・初期配布記録・既読位置・計測イベントを、schemaを含む明示allowlistに追加した。課金、対人、ギルド、ランキング報酬、未知の将来テーブルは保護対象のまま。

旧UIDのhook参照用partial indexにCOMPLETEDを含めた。

## 実データの注意

「テスト1」にはPvP防衛履歴1件、デイリーランキング報酬関連各1件、social activity2件がある。現在の保護条件では、この実アカウントの置き換えは拒否される。基本参照不足を理由に対人・報酬履歴の保護まで解除していない。

## 再実行

`node scripts/build_google_replacement_rollback_sql.mjs` の出力SQLを、対象Previewに限定して実行する。候補のCOMMIT/NOTIFYは除去され、試験末尾のROLLBACKで終了する。すでに候補DDLを永続適用した環境ではそのまま再実行せず、適用状態を確認して試験を調整する。

## 未確認

本試験はSQL契約の検証。PostgRESTの実HTTPでhookがロードされること、Google実認証、公式Admin APIでの実削除、native IDtoken連携完了はPASS扱いしていない。機能有効化flagは未設定のまま維持する。
