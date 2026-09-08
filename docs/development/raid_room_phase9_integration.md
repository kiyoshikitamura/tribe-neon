# Raid第9工程 親統合記録

2026-09-08 JST。基準 `4b331404d61dd7b181e2fc1a4f0f5f93dd23f558`。RAID-A/B/C/P-09は親レビュー・機械検証完了（VALIDATED）。本記録を含むPR headを成果物の対象とする。

## 変更

- A-09: Room専用確定・期限終了・本人結果RPC。台帳と開始receiptでEdgeの確定先を選ぶ。期限後・討伐後はraw貢献だけを保存し、終了HPと討伐結果を変更しない。
- B-09: Roomから製品の出撃準備・専用開始・既存Replay表示へ接続。開始request/payloadを固定し、成功receipt後は再開始せず保存Snapshotから再試行。raw/appliedを別表示し、旧報酬RPCを呼ばない。
- C-09: 実SQL、期限・再送・権限・旧trigger分離検証。親指示で製品の実戦闘フック検証も追加。
- P-09: API/SQL/画面レビューと統合。旧finalizerのシーズン更新呼出しが254再定義で失われていた点を発見し、非Roomだけに復元。開始済み戦闘の再試行で現マスターへ依存する箇所と、通信例外時の未確定互換session保存を修正した。実フック検証で短引数時の準備フラグ位置ずれによる二重開始も検出し、共通引数処理を修正。最終型検証でtuple castを調整し、実フック5件を再実行PASS。

## 検証

|対象|親確認結果|
|---|---|
|PGlite SQL250〜256、実144 Result検証、実3trigger|16 PASS|
|共通・controller・adapter・開始attempt・Edge route helper|63 PASS（attempt7件、Edge4件を含む）|
|既存Room React操作|20 PASS|
|製品useBattleフック|5 PASS（通信・表示マスター等はdouble、実フックを実行）|
|全体TypeScript・Mock Next build|PASS、13ページ生成。最終の引数padding・例外処理修正後も全体型検証PASS|

```bash
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-finalization-run.mjs
node --experimental-strip-types --test tests/raid-room/*.test.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-browser-tests.mjs
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-use-battle-room-tests.mjs
NEXT_PUBLIC_APP_ENV=development NEXT_PUBLIC_USE_MOCK_DB=true npm run build
./node_modules/.bin/tsc --noEmit
```

00256 SHA256: `794850fa1a76d062533b938643866779e0dc5880e295c07fdacb84e0618300a9`。

## 限界・残作業

作成/戦闘開始のDB運用フラグはfalse。製品Room表示も `NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true` の明示指定が必要で、設定変更はしていない。

SQLではAuth、Main総合力、所有Snapshot生成、回復、旧Mission、Guild付与・ranking lifecycle本体をdoubleとし、外部実DB全体を再現していない。Edge route helperの実行検証はDeno handler・HTTP認証・実配置Edgeの試験とは異なる。

通信結果不明のrequest/receiptはフック内で保持し、ページ再読込をまたぐ未確定戦闘の回復は未実装。確定済みresultは既存battle session保存/復帰の対象。自然期限の表示・参加拒否は既存projection/開始判定が行い、期限outcomeを書き込む定期実行は未接続。

救援、報酬/Present、ランキング全読者の切替、実DB/多接続・配置済みEdge・実機確認は未完了。詳細は [有効化前の残接続](raid_room_cutover_remaining.md)。特に新Edgeは旧レイドでも新route RPCを使うため、DB256適用確認がEdge反映より先。

実DB操作・手動Deploy・運用フラグ有効化・mergeは行っていない。バランス研究や既存計算式/毒集計/マスター変更も行っていない。全体開発・複数ユーザーでPresentまで確認できるPreview提供の完了とは扱わない。

最終useBattle SHA256: `8cd2d74987d248bee5aae90a05eac3756744e99925be57b4391da3c537c05b0a`。通信例外fixtureのconsole warnは意図した拒否ケース。Node63件にはEdge4件とattempt7件を含み、別計上して合算しない。
