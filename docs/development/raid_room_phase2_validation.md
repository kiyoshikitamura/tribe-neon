# Raid Room 第2工程 検証記録

2026-09-08 JST / RAID-C-02。新Room backendへの接続、実戦闘、DB更新は行っていない。

## 実行結果

- Node 24.19.0 `node --experimental-strip-types --test tests/raid-room/*.test.mjs`: **34 PASS**（初回26 + controller 8）。
- React 19.2.4 / JSDOM 26 / Testing Library React 16による操作: **7 PASS**。
- TypeScript 5.9.3 strict/noEmit: 対象domain、RaidRoomBrowser、実共通UI、QAのpage/Harness/fixture、テストfixture/React操作テスト **PASS**。scratchへ対象ソースを複写した限定検証。GameContextはplayCyberSeを持つContext型stub、next/navigationはnotFound型宣言に置換。Next全体build・実Context統合は未検証。

## 検証対象

controller: Room切替時の古い成功/失敗応答の破棄、更新応答の順序逆転、未取得/参加不可、参加連打、救援ID保持、参加失敗後の再取得必須、一覧取得失敗復帰、dispose後の反映/参加停止。

React操作: 難度選択からRoomへ、参加者表示、報酬ダイアログ、参加からReplay参照への受け渡し、通信待ちと二重タップ抑制、参加失敗から更新後再試行、未取得資格からサーバー許可への更新、画面遷移だけ失敗した際の同一Replay再遷移（join再送なし）、操作ブロック解除、空一覧と取得失敗の分離、終了Roomでの参加不可。

## 再実行

Repositoryのpackage/lockを変更せず、別の空ディレクトリへ依存を用意する。

```sh
npm install --prefix /path/to/raid-test-runtime --no-audit --no-fund react@19.2.4 react-dom@19.2.4 jsdom@26 @testing-library/react@16 esbuild@0.25
node --experimental-strip-types --test tests/raid-room/*.test.mjs
RAID_TEST_RUNTIME_DIR=/path/to/raid-test-runtime node tests/raid-room/run-browser-tests.mjs
```

runnerはGameContextモジュールだけplayCyberSeのtest doubleへ差し替える。OutlawButton / OutlawCard / CanonicalDialogは実コード。CSSはJSDOMで描画せずempty loaderとする。生成物は指定runtime内の一時ディレクトリに出力後削除する。

## 未検証と後続確認

JSDOM操作PASSをモバイル表示/Human PASSと扱わない。320/390/412px、実機Safari/Chromeの表示・スクロール・タップ・spinner表示はQA導線で確認する。実GameContextとの接続、Next起動、Preview実API・DB・複数ユーザー、戦闘/報酬/PresentのAuthority、サーバー側冪等性は後続工程。controllerの連打抑止は通信障害をまたぐ二重消費の保証ではない。
