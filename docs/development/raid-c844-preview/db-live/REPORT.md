# c844 専用 Preview 実接続検証

候補 `c844534f5ce160fb3e713a58aed8377190aaa209`、DB `sufvuqdnqohpfzkwxohq`。Production 書込みなし。フロント対応は親担当の READY Deployment `dpl_FgKMDvp1NdvjYDzNtYmTfHxYuVLi`（https://tribe-neon-3qicrkiov-kiyoshi-kitamura.vercel.app）。本資料は実 HTTP Auth/RPC/Edge と DB readback の結果で、人による UI 受入とは分離する。

## 適用

06-launch-balance.sql の固定本文を専用 transaction/guard で囲み、2026-09-09 16:44:56 UTC に一度だけ適用。元 SQL / driver の SHA256 は apply-06-manifest.json、結果は apply-06-result.json。旧 Bundle 再投入なし。Stock 07 の disabled flags 前提は現在の専用 Preview と異なるため使用せず、実 flags true/true/true/false 保持を検証した。

28 profiles / 140 members を作成。既存 8 Room への snapshot 後付け 0。Room / boss / Replay enemy / canonical Raid master / flags を適用 transaction 前後で照合し不変。期限 finalizer は prosrc MD5 `835c1a472ef0d003b328afdb0d38d8d3`、functiondef MD5 `be4bad717c6bc92feeb816559070b85f` で同一関数。異なるハッシュ入力を変更と扱わず、関数は上書きしなかった。

## QA 実接続 PASS

- 新規匿名 Auth 5 人を登録直後から QA 分類。既存測定 Party を新規ユーザーだけへ設定。実総合力は初級 58,740、中級 200,786、上級 240,562、超級 279,587、救援 58,740。既存 Party / 公開 master / power gate の変更なし。
- 4 難度の新 Room を正規 create RPC で作成。今回の日替わり対象 ROPPONGI の HP は 190,000 / 2,100,000 / 13,500,000 / 41,800,000。全 20 敵の Character ID / Lv / awakening / 装備 ID・Lv・plus / Skill ID・plus を固定候補 profile と完全照合した。
- 実 Auth → 正規 start RPC → resolve-battle Edge → recovery acknowledgement を計 7 戦実行。中・上・超級各 1 戦、初級救援 2 戦・通常参加 1 戦・主催 1 戦。全開始要求の即時再送は同じ Replay ID。
- 初級は HP 短縮なしで討伐。救援は 2 戦・貢献 123,663 で QA 閾値 60,000 を満たした。通常参加 38,000、主催 42,909。最後のダメージは raw 42,909 / 適用 28,337 で HP 0。
- 討伐報酬 3 Present（各 EQUIP_EXP_S ×3）と救援 1 Present（CHAR_EXP_S ×2）を発行、正規 claim RPC で全 4 件受取。全二重受取は P0001 で拒否。
- 新 QA 初期 RP 5 から合計消費 2。最終 RP 5 / 4 / 5 / 5 / 4 を readback し一致。追加補充なし。自然 RP 回復の試験とはしない。

詳細 ID / Replay / Present / response hash は live-validation.json、全装備・Skill ID と RP は detailed-readback.json。7 戦で必要代表経路が成立したため無目的な 8 戦目は追加しなかった。

## 一時 QA 設定と保持

proposed-settings-v3.json は未承認の公開候補であり、専用 QA 検証だけに使用。既存 ACTIVE Room の参加者を既存 QA と照合し、当該検証時間中だけ共通 reward/threshold 設定へ適用した。個別 Room に閉じた設定ではないため、適用 16:51:38 UTC → 復元 16:52:02 UTC の共有設定期間を明示する。公開承認には該当しない。

元設定 original-qa-rules.json へ完全復元し JSON 一致 PASS。旧 8 Room / boss / Replay enemy は戦闘実行前後でも hash 不変、旧 snapshot 後付け 0。旧 Room の結果や報酬を変更していない。新 3 Room（中・上・超級）は ACTIVE で通常期限処理に委ねる。新 QA 5 人・4 Room・7 Replay・受取済み Present は証跡として残す。

## 再利用と未確認の区別

今回直接実施した再送は start と Present 二重受取。確定済み Edge 再送と自然 Cron 期限終了は前回 raid-prepublication-closeout/live-rehearsal の実接続証跡を再利用する。親照合で resolve-battle / engine / Canonical は 8c → c844 の変更なし、期限 finalizer 定義も同一。今回は新 24 時間待ちや全難度討伐を追加せず、4 難度の実戦と代表初級の全ライフサイクルを検証した。

Fresh は別担当の UI 証跡。指定 Fresh UID `2c5fa849-8400-430d-9c3c-516cd928a8c9` を QA 分類し、親の依頼により同 UID の Auth email_confirm / password だけ準備した。メール送信なし、進行・装備変更なし。資格は commit 対象外の outputs/private にのみ置き、commit 対象へ値を保存していない。guest 経路の観察時にはこの Auth 変更タイミングを考慮する。

## 再実行上の注意

apply-06-preview.sql は適用済みのため再投入しない。run-qa.mjs は新ユーザーと Room を作り共通 QA 設定を一時変更するため、再実行時には専用枠と既存設定を改めて確認する。readback.mjs は読み取りのみ。prepare-fresh-auth.mjs は匿名 UID の厳格 guard があり、完了後の再実行対象ではない。公開設定の承認、本番適用、alias 切替はこの検証に含まない。

### Fresh Auth HTTP 完了追記

親の実 UI Result 後案内到達後、同 UUID の password signin → 正規 complete_tutorial_authentication(EMAIL) → local logout → password 再 login を実行し PASS。AUTHENTICATION / gameplay_authorized=true / integrity=true。ensure_initial_equipment_v1 を両 session で呼び、初期装備 5 UUID と GRANTED receipt 全 JSON が前後完全一致した。fresh-auth-completion.json 参照。初回は authentication_pending=false / tutorial_step=COMPLETE のため harness の pending=true 前提で RPC 前に停止し、fresh-auth-pending-precheck.json へ保存。実関数の COMPLETE 条件へ事前 guard を合わせた再試行で完了。直接進行書換なし、Auth UI 受入とは分離。
