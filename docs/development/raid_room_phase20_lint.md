# Raid 第20工程 lint失敗の切り分け

対象: PR #27 head `58c7f1f45d229424857dd59943eb368ff2af98ab`。2026-09-08。

## CI記録

[Actions job 101970384138](https://api.github.com/repos/kiyoshikitamura/tribe-neon/actions/jobs/101970384138) のログを取得した。`npm ci` 完了後、`npm run lint` が Node heap 約4GBで `FATAL ERROR: Reached heap limit`、exit 134。TypeScript検証・buildより前の失敗であり、型エラーによる失敗とは分類しない。

CI実行は Node 22.23.2。checkoutはPRの合成merge SHA `2e8aee2219707a95fbf80252e542e5ea8ad62aa8` で、Git commit APIのparentsは `314b38f170001a1d88f57e05e39e9eeb866b0dc3` と上記head。PR表示のbase基準SHAとは分けて記録する。

## 対象ファイルとローカル再現

headのrecursive treeでJS/TS系ファイルサイズを確認した。最大は `src/utils/mock/mockRpc.ts` 262,612 bytes、`src/app/context/GameContext.tsx` 196,827 bytes、`src/hooks/useBattle.ts` 165,899 bytes。除外すべき巨大生成bundleは見つからなかった。

ローカルは Node 24.19.0、lockfile由来の ESLint 9.39.5 / eslint-plugin-react-hooks 7.1.1 / eslint-config-next 16.2.10。CIとNodeのmajorが異なるため実CI再実行の代替にはしない。

```sh
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/eslint/bin/eslint.js --debug
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/eslint/bin/eslint.js src/hooks/useBattle.ts --debug
```

両方ともheap OOM・exit 134を再現した。全体実行の最後の対象は `useBattle.ts` で、同ファイルのparseとscope analysisは成功し、lint完了前にOOMとなった。単独実行でも同じ失敗が出るため、生成ファイルをglobalIgnoresへ追加する変更では解消できない。

## 診断限定の比較

ESLint APIの一時 `overrideConfig` でReact Compiler系の14ルールのみoffにし、`react-hooks/rules-of-hooks` / `react-hooks/exhaustive-deps` と他の既存ルールを保持した場合、同じ `useBattle.ts` は処理完了、error 0 / warning 94となった。このoverrideはメモリ上だけで使用し、Repository設定へ保存していない。これは原因切り分けであり、通常lintのPASSではない。

インストール済みpluginの `makeRule → getReactCompilerResult → runReactCompiler` がcompiler系ルールの共通解析を実行していることも確認した。Compiler系の解析がOOM発生経路に含まれると判断する。特定ルール単体や、関数内のどの文が増大要因かまでは未確定。

## 変更判断

`eslint.config.mjs`、製品コード、依存バージョンは変更していない。製品 `useBattle.ts` のignore追加・ルール緩和で見かけの成功にしない。

6GB heap・180秒上限の単独再検証でも上限時間到達前にheap OOM・exit 134となった。開始前の環境cgroup上限は20GB、使用約5.35GBで、単純なOS側上限不足としては扱わない。6GBへの増量だけでの解消は確認できず、永続設定には採用しない。実Preview、実DB、Deploy、Human PASSはこの調査に含まない。

## 開発基準との限定比較

開発基準 `b08e396e657615afd6dfddc05bbec37d21561a25` の `src/hooks/useBattle.ts` をscratchへ取得し、現行依存環境・同一filename・通常ルールで比較した。基準の `eslint.config.mjs` は現行と同文である。

```sh
NODE_OPTIONS=--max-old-space-size=4096 timeout 120s node node_modules/eslint/bin/eslint.js --stdin --stdin-filename src/hooks/useBattle.ts < /tmp/raid20-baseline-useBattle.ts
```

基準版は **exit 0、error 0 / warning 91** で完了した。基準版も同じOOMになるという仮説は成立しなかった。現行版は通常4GB/6GBでOOM、基準版は同じ4GBで完走する差がある。したがって、この失敗を根拠なく既存gate障害として扱わない。一方、差分内の特定箇所が原因とまでは証明しておらず、Compiler解析負荷の原因箇所の特定・修正は残件である。
