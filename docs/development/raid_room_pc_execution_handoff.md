# PC側Codex実行指示 — Raid Preview接続・実環境検証
作成日: 2026-09-08
状態: READY_FOR_PREFLIGHT（接続確認から着手可能。実機提供可能ではない）

## 目的と担当
このチャットを親とし、PC側Codexは既存の管理接続環境で独立Previewへの接続・適用・検証を担当する。
Repositoryの開発ルールに従い、結果は日本語でRepositoryへ記録する。
親からPCを自動起動・遠隔操作する経路は未設定。ユーザーがPC側Codexへ本書を渡して開始する。
親は第21工程の修正・レビューを担当中。PC側は同じファイルを並行修正しない。

## 対象と開始時の固定
- Repository: kiyoshikitamura/tribe-neon
- PR: https://github.com/kiyoshikitamura/tribe-neon/pull/27
- 開発ブランチ: codex/raid-room-rescue-20260908
- 本書作成時の確認済みコードSHA: ca696b697c80c2cea62237a9547c8fc40522312f
- 本書は上記SHAの後に追加する文書。適用するコードSHAは開始時にPR headとrelease_boardを照合して別途記録する。
- mainを実装基準にしない。既存PCの未commit変更を上書きしない。専用worktree/checkoutを使用する。
- 作業開始時にremote URL、branch、HEAD、作業ツリー状態を記録する。秘密情報は出力しない。
- PC専用作業ブランチで報告・修正をcommitし、親へcommit SHAを返す。親ブランチをforce pushしない。mergeは親へ戻す。

## 最初に読む正本
1. .agents/AGENTS.md と対象ディレクトリの追加AGENTS.md
2. docs/development/release_board.md と現行agent_tasks/RAID-*.md
3. specs/raid_room_rescue_v1.md
4. docs/development/raid_room_preview_cutover.md
5. docs/development/raid_room_preview_config.md
6. docs/development/raid_room_phase19_integration.md と raid_room_phase20_integration.md
7. specs/deployment_guide.md

古い一般規約と新Raidの確定仕様が異なる場合、最新の明示されたユーザー決定とRaid正本を照合する。旧Raidの回数制や順位報酬を復活させない。

## 現状と第21工程の扱い
第20工程までの対象検証はVALIDATED。ca696b6のCI run 34202157913では通常lint・型・job内検証・build、独立Raidブラウザ18件、EdgeがPASS。
広域E2Eは189 PASS / 8 FAIL / 2 interrupted / 91未実行で、全体合格ではない。
第21工程は親側の未統合作業であり、上記コードSHAに含まれない。
- QAシナリオ44件・通常Homeバナー4種への期待値訂正。
- KPIブラウザ検証用Basic認証設定。
- MockメールログインのUID保存・認証通知修正。子検証6件PASS、対象lint/型PASS。親レビュー・ブラウザ確認待ち。
- 認証E2E fixture/操作対象の修正、Homeバナー未表示の原因確認が継続中。

第21工程をVALIDATEDと扱わず、修正済みコードがあると推測して適用しない。
接続先・スキーマの読取照合は現在のSHAで先行可能。実機提供候補は第21工程の統合状態・残るCI失敗の影響を親と照合して固定する。

## 工程1: 管理接続の確認（まずここを実行）
既存PCの正規のCLI/管理接続を使用する。認証情報をチャット・git・報告へ貼らない。
以下を読み取りで確認し、docs/development/raid_room_pc_preflight.md に記録する。
- Previewの実project ref、DB接続先の識別情報、Auth URL、配信project。
- 既知Preview候補 sufvuqdnqohpfzkwxohq は履歴情報。実接続を確認するまで確定扱いしない。
- Production ktpolnkyyfkowxdmijww および本番ドメインは適用対象外。
- 現在のPreview配信URL・環境区分・配信SHA、Edge接続先/版。
- migration履歴と実スキーマ/関数定義。00250以前の依存・品目マスター・Replay/Present経路を確認。
- pg_cronの利用可否、既存jobと実行履歴。
- Previewの利用中タスク/担当と変更競合、使用できるテストユーザー/Guild。
実DB監査のSQLはREAD ONLY・timeouts・ROLLBACK。get_active_raidsは生成副作用があるため読取目的で呼ばない。
接続不足があれば必要な接続名/権限だけを報告し、オフライン検証・差分作成を継続する。

## 工程2: 適用内容を具体化
raid_room_preview_cutover.mdに従い、現DBに必要な差分だけをリスト化する。
00250〜00263を番号だけで一括再実行しない。依存不足や既存定義差があれば、対象と修正案を記録する。
対象SHA、DB/Edge/UIの対応、適用SQL、復旧手順を実行前に確認できる状態にする。
00257は毎分Cron登録を伴う。RoomフラグfalseでもCronが登録されることを計画へ含める。
この指示書だけを本番変更や他タスクの環境上書きの許可と解釈しない。

## 工程3: 独立Preview適用・設定
対象Previewと差分が確定したら、既存の承認範囲と開発ルールに従ってDB → Edge → UIの順に進める。
手順の詳細はraid_room_preview_cutover.mdを正本とする。
- 旧生成/新規開始を停止し、旧開始済み戦闘の確定・既存Present受取を維持する。
- Mockを無効にした実DB接続であることを確認する。
- NEXT_PUBLIC_RAID_ROOM_UI_ENABLEDはbuild時設定。配信物と実SHAを確認する。
- 各運用フラグ・報酬設定は準備成立後にPreviewだけで有効化し、適用前後の値を記録する。

config/raid-room/preview-settings.template.jsonの4難度の閾値/報酬品目・数量は未入力。
確定済み資料に値があれば引用して使う。なければ実機用の暫定設定案を1枚にまとめ、親へ返す。
ゲームバランス研究を追加しない。未承認の候補を承認済みと扱わない。
値が揃うまでも接続・migration差分・型/権限・報酬以外の確認準備は進める。
生成ツール:
node scripts/raid-room/build-preview-config.mjs preview-settings.json
生成SQLはROLLBACK/報酬無効。生成しただけで適用済みと報告しない。
永続設定と有効化は対象確認済みの別実行として記録する。projectRef注記は接続先検証の代わりにならない。

## 変更しない確定条件
- 参加総合力: 初級条件なし、中級160,000/上級200,000/超級240,000。一致で参加可。既存Lv5解放を保持。
- Room終了: 開催から24時間または撃破。
- 開催中Room数上限: 初級/中級/上級10、超級5。参加者数上限とは別。
- 救援公開先: 全体Activity/依頼時所属Guild Chat、各公開先につきRoomごと3回まで。
- 救援成功: 救援由来・戦数・貢献下限・撃破のAND。救援貢献は以上。
- 討伐報酬: ACTIVE中に確定した本人累積貢献Damageが閾値を超過し、Room撃破。一致は不成立。撃破打を含み、終了後確定は対象外。
- 両報酬は別台帳でRoom×本人ごと1回、Present自動送付・30日期限。
- レイドランキング廃止。他ランキング・既存Presentは保持。
- 毒Damageのraw集計変更、過去報酬の遡及付与を本工程に含めない。

## 工程4: 実環境の受入検証
少なくとも主催者・通常参加者・救援参加者の複数アカウントを使う。
1. Room作成/一覧/参加者、実出撃編成の参加境界、作成上限、24時間/撃破終了。
2. 両公開先の救援、各3回上限、同一要求再送、Guild移籍と期限切れリンク。
3. 戦闘開始/確定/共有HP/結果、再読込・端末保存消失から同一戦闘復帰。
4. 救援・討伐の境界、Present発行/受取、再送時の二重消費・二重付与なし。
5. 複数DB接続の同時確定、期限との競合、終了後確定。
6. 実Cronの期限終了と取り残し処理。
7. 旧生成/新規開始停止、旧開始済み確定、他ランキング/既存受取の回帰。

テストデータによる期限境界検証と実Cron稼働確認を区別する。
失敗は再現条件・期待/実測・影響範囲を記録し、対象修正と必要な再検証を行う。
既存台帳やPresentの削除で再試験を成立させない。新規テストRoomを使う。

## 結果の返却と完了条件
docs/development/raid_room_pc_validation.md と担当タスク契約へ以下を記録し、commit SHA/ファイルパスを親へ返す。
- STATUS: IN_PROGRESS / IMPLEMENTED / BLOCKED / HUMAN_REVIEW_READY
- コードSHA、実配信SHA/URL、Preview ref、Edge版、適用migration/設定版
- 実行日時JST、検証項目、件数、PASS/FAIL/未実行、根拠ログへのパス
- DB/Edge/UIの実変更と有効フラグ、復旧可能な版
- 未完了点と実機手順/テストユーザー識別名（資格情報を含めない）

PC側の自己検証だけで親レビュー完了のVALIDATEDにしない。
親が根拠を確認した後にrelease_boardを更新する。
実機へ渡す条件は実Previewで一連動作が成立し、URL/SHA/設定値/残件が揃うこと。
人の実機確認を機械検証で代替せず、本番反映・自動merge・本番フラグ変更は行わない。
完了通知は親レビュー/検証完了または実機確認待ち到達時。作業commitだけを全体完了と通知しない。
