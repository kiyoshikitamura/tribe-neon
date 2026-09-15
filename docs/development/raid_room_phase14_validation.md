# Raid第14工程 検証記録

2026-09-08。RAID-C-14の機械検証。親レビュー・全体型/ビルド・統合判定は親記録を参照。

## 方法

永続化モジュールはNode単体テストでStorage doubleを使用。画面操作は既存JSDOM runnerで実RaidRoomRescuePanel・実共通UIを使用し、RPC clientだけdoubleに置き換えた。各ケース前にlocalStorageを初期化し、再mountケース内では保存内容を維持する。

## 実行コマンド

```sh
node --experimental-strip-types --test tests/raid-room/rescue-pending.test.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-browser-tests.mjs
```

## 結果

- 永続化単体4件PASS。
  - 保存済み要求の再読込でも同一requestIdを保持。
  - user/Roomごとに分離し、区切り文字を含むkeyも衝突しない。
  - 未確認要求を別要求で上書きできず、次の要求が保存された後の古い応答では削除できない。
  - 書込例外と読戻し不一致を保存成功と扱わない。
- React既存24＋新4＝28件PASS。
  - 通信応答消失後、再mountして同一要求を確認。成功後の次回依頼は新requestId。
  - Room終了のdisabled・送信無効・両公開先3回到達でも、保存済み要求は同requestIdで確認可能。確認後の新規送信は抑止。
  - localStorage書込失敗時は送信RPC呼出0件。
  - user切替中に旧要求が完了しても送信成功表示・回数が新userへ混入しない。
- 既存の同一mount内retry検証はuserIdを付加し、保存済み要求の確認ボタン名へ追随。従来の公開先回数更新・操作ブロック解除を維持。

初回単体1件はテストが未確認要求の上書きを仮定していたため修正した。実装の上書き拒否に合わせ、旧要求成功確認→次要求保存→古い応答による削除拒否の順で検証した。製品仕様の変更ではない。

## 検証の限界

実DBのreceipt判定、実ブラウザ/端末の保存挙動、複数タブ同時操作は未検証。別ユーザー切替での表示隔離は同一JSDOM内の検証であり、操作ブロック保持を実複数タブで保証する検証ではない。ReactはJSDOMのためCSS描画や実機Human PASSではない。保存消失/破損からのサーバー一覧による救援要求復元は今回の実装範囲に含まれない。SQL、報酬値、ランキング方針、実DB、Deploy、運用フラグは変更していない。
