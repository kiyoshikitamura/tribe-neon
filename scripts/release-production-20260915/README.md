# 正式移行DB差分 — 2026-09-15

対象: Production `ktpolnkyyfkowxdmijww`。Preview `sufvuqdnqohpfzkwxohq`は参照のみ。

## 状態

- 本担当はREAD ONLY調査・SQL作成のみ。DB変更なし。
- `10_gameplay_candidate.sql`: 親による単一transaction ROLLBACKリハーサル待ち。未PASS。35段階。
- `manifest.json`: Migration名の先頭version除去で比較。Preview履歴の実適用順に並べた。
- Productionはsnapshot baselineのため、履歴の欠落だけで未適用と判定しない。
- 全public関数の定義取得時点は課金適用直前。課金5表12関数は親がその後 `20260915121836_formal_open_billing_foundation_and_paid_contract` で適用済み。
- Production本人限定DB `20260915115637_operations_maintenance_test_access` を保持。
- Previewガチャ `20260915113959_special_gacha_pity_per_banner` は適用済み、再適用禁止。本候補はProductionへの初回導入。

## 保持・除外

- initial_equipment_receipts、ensure_initial_equipment_v1、initialize_current_playerは本番既存。公開関数はPreviewとhash完全一致。
- newsは本番既存10列で新基盤と一致。DROP/CREATE/記事更新なし。
- 無料ガチャ確率2関数は改行以外一致。Productionの確率を保持。
- KPI関数群はProduction独自最新修正を保持し、Preview定義による上書きなし。
- raid_room_can_read_v1はProductionのcross-midnight改善を保持。
- Preview Google置換機能は除外。本人限定アクセス関数を上書きしない。
- 課金基盤bundleは重ねない。ただしガチャ通貨境界の `scripts/billing/preview_special_gacha.sql` は未適用だったためSECTION01bに追加。

## データ変更監査

- normalize_gacha_stage1は本番未適用。旧Pool件数との一致を確認し候補に含めた。
- 適用前の本番pity行数0。ガチャ4種分離の既存残高移行対象なし。
- 進行中patrol 86行の変更前cash(600/1200/2000)をtemp保存しbase_cash_snapshotへ反映。Preview日時cutoffでは本番保全にならないため、この部分のみ本番適応。
- canonical_character_growth_runtimeはCURRENT総合力projectionを再計算する。日次Snapshot更新RPCを呼ばない。通知triggerは表lock内で一時停止後、元状態に復元する。対象定義hashは本番一致。
- Season関連は関数・空テーブル・報酬master定義のみ。Season開始終了、報酬付与、cron登録・実行は別工程。
- start_formal_open_seasons_v1はmonthly_rolloverの依存として定義を含めた。実呼出しは禁止。最新お知らせの「正式翌日開始」と旧同時開始関数の運用整合は別工程で必要。

## 実行時

1. 親でMAINTENANCE、課金既適用、本人限定helper、既存ユーザー資産/運用state/Season/news/cronを保存確認。
2. 単一transactionで候補を実行しROLLBACK。失敗は原子rollbackとし、反映済みと報告しない。
3. anchor不一致はProdとPreviewの実定義差を確認し、既存改善を保持して修正する。
4. リハーサル成功後にのみ親がapply_migration。Previewに適用しない。
5. 新関数・master・RLS/権限、本人限定helper不変、資産/運用設定不変を確認。

SQL内のトップレベルBEGIN/COMMITはレキサーで除去。関数のBEGIN/ENDは維持。呼出側でtransactionを管理する。
