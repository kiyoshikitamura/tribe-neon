# 専用スキル・装備演出 本体接続・復旧 2026-09-13

ユーザーが専用スキル台詞候補20件を承認したため、全20件を `exclusiveSkillDialogue.ts` に正式表示データとして登録した。スキル名・対象キャラ・効果は既存正本のまま。

環境再作成で失われたローカル b742fbb / e1a4e59 の変更内容を remote 1a9e3fc から復旧した。旧コミットIDを配信済みとは扱わない。

## 接続範囲

- Quest / PvP / Raidの共通Replayに、本人専用スキルの暗転・台詞1100msを追加。既存cutin時間後にOutcomeカーソルを消費するため、HP・回復・状態適用をUI台詞より先行させない。発動ごとのReplayカーソルkeyでフル演出を再生。
- Street表示と従来Raid表示へ台詞→既存cutinを接続。専用スキルにガチャ台詞を流用しない。通常品・他キャラ専用品は対象外。
- server snapshotの `equipment[].equipmentId` をParticipantへ保持。開始時の味方最大5名について本人専用装備帯を左右から120ms間隔で表示し、先行帯を保持して1250msで終了。共通Replay初ACTION待ちにも1250msを加える。旧Replayで装備データがない場合は現在在庫を参照しない。
- legacy life/character/speed-linesおよびStreet立ち絵animationも1100ms遅延し、隠れたwrapper内でcutinが先に終わる不具合を防ぐ。
- legacyにpauseを伝搬。CSSと可視終了タイマーを停止し、残時間から再開。発動ごとの時計を分離して前発動cleanupが次発動残時間を減らさない。
- reduced-motionで台詞→cutinと装備帯終了の意味上の境界を保持し、永続暗転を防ぐ。
- 目元は既存立ち絵のCSS crop。独立した正式目元素材を作成済みとは扱わない。
- 戦闘配列・Leader・ダメージ計算・報酬・共有HP・AP・cooldown・DB変更なし。

## 復旧後検証

- Typecheck PASS。
- Exclusive catalog/dialogue/snapshot PASS（20台詞・本人・旧Replay・配列不変・繰返し発動key・Outcome待ち・子animation遅延・pause・120ms帯）。
- Battle presentation契約 PASS（deterministic replay、HP parity、対象効果スコープ）。
- Quest Battle Result liveness / PvP Leader表示回帰 PASS。
- Focused ESLint 0 errors。

## 残件

- Previewで実排出→本人装備→Quest/PvP/Raid演出、pause/倍速/再読込、HPタイミングの実画面受入。
- `WEAPON_047` / `WEAPON_049` / `HEAD_020` 透過修正は未完了。生成試行はアルファを持たず造形再描画もあるため不採用。既存画像を維持。
- 目元cropのキャラ別見え方、帯の実機テンポ。
- DB変更・remote保存・配信・Production変更はこの子タスクでは未実施。
