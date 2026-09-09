# Raid第9工程 SQL検証記録

2026-09-08 / RAID-C-09 / 子実装完了・親レビュー待ち。

## 実行結果

PGlite 0.5.8 / PostgreSQL 18.3 (WASM) の一時DBに00250〜00256をファイル本文のまま適用。既存00144の `validate_official_battle_result` 関数本文を抽出適用し、256のdaily/Guild/ranking参加trigger実関数をReplay更新に接続した。16件 PASS、FAIL 0、exit 0。

対象 `20260908000256_raid_room_finalization.sql` SHA256:
`794850fa1a76d062533b938643866779e0dc5880e295c07fdacb84e0618300a9`

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/db/raid-room-finalization-run.mjs
```

## 確認した条件

- 期限前確定: raw、applied、HP、個人貢献、戦数、Events保存。
- 期限後確定: raw/個人貢献を保存、applied 0、残HP不変。
- 残HPを超えるDamageはclipping。撃破後の別戦はrawのみ保存し、boss行全体（outcome、cleared_atを含む）は不変。
- 同Replay再送: 保存結果を返し、HP/貢献/Events/報酬台帳は不変。
- 本人参照: PENDINGはnull、確定結果取得。別人・匿名拒否。
- 公開ロールの確定/route/期限終了RPC拒否。
- 正式開始receiptなし、metadata不一致、receipt requester不一致を拒否。
- 新Room確定で旧daily Present/Guild報酬/ranking参加を発生させない。
- 新Room戦数を旧daily 3戦達成へ混ぜない。
- 非RoomのLEGACY route・旧確定・daily/Guild/ranking参加は継続。
- 期限終了: 期限前は不変、期限後再送は不変。
- 非Room ReplayをRoom確定へ誤投入しても不変。
- ranking lifecycle hook: 新Roomでは呼ばず、旧非Room確定で呼ぶ。
- 既存実validate: round 0、負Damage、events型違い、不正winnerを拒否し、HP/log/Replay等に副作用なし。

## fixtureと限界

Auth uid、Main総合力、所持編成Snapshot、資源回復、旧ミッション、Guild経験値付与本体、ranking lifecycle本体はdouble。Guild/lifecycleは呼出し記録のみ。daily Present発行とranking参加台帳更新は実trigger本文による。既存全migration/schema/外部Authを再現した検証ではない。

各ケースはtransaction rollback。期限ケースは実待機をせず、開始済みReplayのstartedAtを期限より前、boss期限を現在より前へ管理側fixtureで移動する。SQL本文の時刻判定は変更しない。初期RP 9は既存fixtureの消費検出用値でありゲーム上限ではない。

多接続競合、実DB、Edge実配信、UI/戦闘エンジン接続、実機は本記録の範囲外。作成/開始運用フラグの有効化、DB操作、Deployは行っていない。16件PASSを全体開発完了またはHuman PASSとは扱わない。

## 親追加範囲: 実useBattleフック検証

`tests/raid-room/use-battle-room.test.tsx` と専用 `run-use-battle-room-tests.mjs` を追加。React renderHookで実useBattle/attempt/Replay adapterを実行し、通信・表示ステータス・表示用マスターをdoubleに限定する。製品ルーティングの呼出し検証であり実Edge/DB/端末のE2Eではない。

対象5ケース: Room準備キャンセルで開始なし、確認でRoom開始とresolve（旧開始/旧報酬なし）、resolve失敗後に同Replay再試行（start1回）、開始throw後に互換session未保存で同request再試行、非Roomの旧開始/報酬参照継続。

実hookで、短い引数による旧Raid準備呼出しがprepareOnly位置を満たさず、確認前にも開始RPCを呼ぶ既存不具合を検出。親承認のもとBが共用入口の引数paddingを修正する。最終結果は以下へ追記する。

最終再実行: 5件 PASS / FAIL 0 / exit 0。
`src/hooks/useBattle.ts` SHA256: `d23b94fc021ea4cc70557867721283810c677e53d3497672af9abfc9139823e9`。
旧短引数ケースでも準備時start 0、確認時start 1を確認。開始throwのconsole warnは意図的な通信例外fixtureによる。

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/be0ce4e059a1/raid-typecheck-runtime node tests/raid-room/run-use-battle-room-tests.mjs
```

親最終確認: tuple castの型のみ調整後、useBattle SHA256 `8cd2d74987d248bee5aae90a05eac3756744e99925be57b4391da3c537c05b0a` で実フック5件を再実行PASS、全体TypeScript PASS。
