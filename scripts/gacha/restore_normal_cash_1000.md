# Normal CASH価格不具合修正

ユーザー承認：2026-09-11、このスレッドの「ユーザー数が少ない今で即修正」「資産は没収せず」に基づく。

- Production適用：2026-09-11 23:25:37 JST。project ref: ktpolnkyyfkowxdmijww。
- Preview適用：2026-09-11 23:25:29 JST。project ref: sufvuqdnqohpfzkwxohq。
- CHAR_NORMAL / SKILL_NORMAL / EQUIP_NORMALのcost_cashのみ100→1,000。
- 1連1,000 CASH、10連10,000 CASH。commit後の別READ ONLY照会で3行を確認。
- 取得済み資産・残高・履歴は変更なし。差額徴収・回収・補填なし。
- 無料10連・率・Pool・Special・DIA価格・Feature Flagは変更なし。

原因：20260812000125_normal_gacha_contract.sqlでNormal1,000が設定されていたが、20260830000210_canonical_master_freeze_runtime.sqlの価格反映で100に上書き。元データgacha_production_20260830.jsonのNormal cashPerPullも100。今回元データ3か所を1,000に訂正し、再生成時の入力を修正した。適用済み過去migrationは改変しない。新環境へ過去migrationだけを適用する場合は、本SQLを最後に適用する必要がある。

適用SQL：restore_normal_cash_1000.sql。3行の存在・旧値を検査し、対象外master列の不変をtransaction内で確認。抽選RPCはcost_cash×pull_countをサーバー側で算出する既存実装を確認。GachaTabもmasterから価格を表示する。開きっぱなしの画面には古い表示が残る可能性があるため再読み込みが必要。

検証範囲：DB価格の永続化とRPC定義の参照確認。実ユーザーの抽選・資産消費、実機表示確認は行っていない。

## お知らせ案（未投稿）

ノーマルガチャの消費CASHが、本来の設定より少なくなっている不具合を修正しました。
キャラクター・スキル・装備の各ノーマルガチャは、1回1,000 CASH、10回10,000 CASHとなります。
修正前に獲得されたキャラクター・スキル・装備等は、そのままご利用いただけます。差額の徴収は行いません。
無料10連の回数・排出確率・排出対象に変更はありません。
表示が更新されない場合は、ゲームの再読み込みをお願いいたします。
このたびは不具合によりご迷惑をおかけし、申し訳ございません。
