# Raid 第17工程 検証記録

状態: IMPLEMENTED（C担当検証完了。親レビュー・統合判定待ち）

2026-09-08。基準SHA `45dcaba09ac0872c976b5fdcbf773beb096813f2` の限定復元環境で、第17工程のオフライン設定生成を検証した。製品ソース・Migrationの変更、実DBへの接続・SQL適用、Deploy、運用有効化は行っていない。

## 実行

```sh
node --test tests/raid-room/preview-config.test.mjs
```

結果: **11件 PASS、0件 FAIL、0件 SKIP**。

|確認項目|結果|
|---|---|
|4難度の生成・同入力の再現性・入力オブジェクト不変|PASS|
|BEGIN・末尾ROLLBACK・COMMITなし|PASS|
|本番projectRef、preview以外、不正projectRef拒否|PASS|
|null・欠落・未知難度・不足難度・重複難度拒否|PASS|
|version・戦数・数量の正整数検証|PASS|
|貢献値0受理、null・負数・小数・文字列・安全整数範囲外拒否|PASS|
|空明細・空ID・重複品目拒否|PASS|
|品目IDの引用符escape|PASS|
|運用設定の変更・Present発行SQLなし|PASS|
|バックスラッシュと引用符の複合escape・制御文字拒否|PASS|
|救援と討伐の入力列対応・4難度×2報酬のenabled=false|PASS|

fixture内の品目 `TEST_ONLY_ITEM` と数値は入力検証専用である。承認済みバランス値、実在品目、Preview投入値として扱わない。

## 検証範囲と残件

この結果はNode上の入力検証・生成SQL文字列の検証である。PostgreSQLでの実行成功、Migration適用済み、実在する品目ID、接続先環境、DB権限、実機確認可能状態を証明しない。生成SQLに記載されるprojectRefは識別用注記であり、接続先の検証機構ではない。

実機用の閾値・報酬品目数量、独立Preview接続先と配信環境の照合、DB差分適用、複数ユーザー・実Cron・実機による受入は未完了。生成結果はROLLBACK専用であり、永続反映・報酬有効化・Room公開は別工程とする。全体型検証・Mock buildの再実行も本工程Cの対象外。

## 実行対象の識別

- Node: `v24.19.0`
- 生成スクリプトSHA256: `b4469b0fbe2bd07804b0cce94453741897761cb18b86f5b4166ea31dea7712d7`
- テストSHA256: `48d68316967aa83ab3b5116f11b34a92f5dc16f3a882afdf90d39f26d945ab08`
