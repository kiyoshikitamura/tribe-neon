# Guild在籍日数：別スレッド決定依頼

状態：加入日のカウントのみ判断待ち。実装・DB変更なし。
照合基準：`112a21377fc384f70d93230439eb64bc3b4d0767`。

## 決めること

現在のGuild membership開始日を、JST日付で **1日目（Day1）** と数えるか、**0日（Day0）** と数えるか。

例：9月14日23:50 JST加入、9月15日00:10 JSTにMission同期。

| 定義 | 加入日 | 翌JST日付 |
| --- | ---: | ---: |
| Day1（既存指示の採用候補・未確定） | 1 | 2 |
| Day0 | 0 | 1 |

どちらでも、ログイン日数や24時間経過数ではなく、現在membership開始日からのJST日付差を使用する。
日数に1を加えるかどうかだけが今回の判断対象。

## 根拠と確認結果

- `src/domain/gameplay/canonical/data/missions_20260910.json`：MIS_N_U005/U006は「Guild在籍30日／90日」。`conditionParams`は空で、Day0/Day1指定なし。
- `specs/mission_requirements_20260912.md`：在籍定義と加算経路を保留と明記。
- `specs/mission_implementation_20260912.md`：在籍定義を未確定と明記。
- `docs/development/formal_open_normalization_second_patch_20260914.md`：joined_atあり、日数投影なし、Day0/Day1判断待ち。
- `docs/development/formal_open_integrated_release_management_20260914.md`：現在membership開始日・JST単位・Mission同期時計算を指定。加入日のカウントは既存Authority確認後に確定するよう指示。

## 決定後

Mission同期時のauthoritative日数投影を実装し、加入日・JST境界・30/90日境界・再同期で二重加算しないことを検証する。脱退・再加入は既存membership契約に従って別途接続確認する。

EXP候補や報酬内容は、この判断に含めない。
