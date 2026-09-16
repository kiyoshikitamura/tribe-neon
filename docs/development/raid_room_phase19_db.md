# 第19工程：レイド統合SQL検証

担当: RAID-A-19。状態: VALIDATED（親レビュー・再検証完了）。基準: `5243b287f3e3261bd587a736cabc70af528f9dc7`。実施日: 2026-09-08。

## 結果

PGlite 0.5.8 / PostgreSQL 18.3で6件PASS。製品Migration変更なし。

```sh
RAID_TEST_RUNTIME_DIR=/workspace/scratch/3f215bc02a8a/raid18-test-runtime node tests/db/raid-room-integrated-run.mjs
```

|検証|結果|
|---|---|
|実SQL250〜263を同じDBへ番号順に適用、旧enabled=true・Room関連enabled=falseの既定値保持|PASS|
|旧停止下でRoom作成、Activity/Guild Chat双方への依頼・同一要求再送、救援参加、戦闘確定、両Present発行、実claim・重複受取拒否|PASS|
|通常参加者と主催者の討伐報酬、救援未帰属者への救援報酬なし|PASS|
|撃破前開始・撃破後確定は救援報酬のみ、討伐貢献へ混入しない|PASS|
|24時間期限終了・期限後確定は両報酬発行なし|PASS|
|旧開始済みReplayの停止後確定と再送、旧新規開始拒否・一覧/日次生成停止、既存順位Present受取維持|PASS|

各進行シナリオ終了時にRaid順位参加台帳・日次報酬・Season報酬の新規記録0件、順位参照RETIREDを確認。両報酬取得ケースでは同一人物に異なるPresent IDが発行され、Cashは19+37のみ増加する。19/37/11およびDamage101・閾値100は検証専用値であり、運用値の確定ではない。

## 実定義とfixtureの境界

- 実適用: Migration250〜263全文、144の`validate_official_battle_result`、135の`grant_present_payload`・`claim_present`。
- 229/233/234から実ランキング台帳DDLを読み込み、261の依存を構築。
- 既存projection/lifecycle/creation/legacy/entry/finalization/recovery/rescue/reward fixtureを再利用。追加fixtureはranking schema・周辺関数の最小依存のみ。
- 既存finalization fixtureの`advance_ranking_season(text,timestamptz)`はテスト用jsonb返却doubleのため、261適用前に削除し実uuid返却定義へ置換する。製品の関数戻り型不具合ではない。
- キャラ総合力計算・戦闘Snapshot生成・RP回復・ミッション・Guild経験値・PvP境界の周辺処理はdouble。戦闘結果は固定JSONを実validator/実finalizerへ渡す。戦闘エンジンの実計算、PvP境界の本体は本検証対象外。
- 既存順位Presentは発行済み状態をローカルfixtureへ直接挿入してclaim互換性を確認する。過去順位の再計算・遡及付与処理を実行したものではない。
- 単一接続で各ケースBEGIN/ROLLBACK。一部fixture時刻は外側transactionのnow()と生成clock_timestamp()差を補正する。多接続競合試験や実時刻24時間待機ではない。

## 未完了

実Preview DB/Edge/Auth/ブラウザ一貫接続、実Cron、多接続同時操作、実機確認、設定投入、運用切替は未実施。この6件のPASSをPreview提供完了・Human PASS・本番反映済みとは扱わない。
