# c844 Fresh / Character 統合受入記録

配信 SHA: c844534f5ce160fb3e713a58aed8377190aaa209
固定 URL: https://tribe-neon-3qicrkiov-kiyoshi-kitamura.vercel.app
Deployment: dpl_FgKMDvp1NdvjYDzNtYmTfHxYuVLi / DB: sufvuqdnqohpfzkwxohq

実UI操作: Codex / Codex In-app Browser / 2026-09-10 01:45〜02:06 JST。
人の受入: 未実施。以下は実接続の自動操作・画面観察であり、人の承認ではない。

Fresh UID: 2c5fa849-8400-430d-9c3c-516cd928a8c9。
Auth作成 2026-09-09 16:45:52.261844 UTC、名前登録 16:46:47.648215 UTC。登録直後からQA分類。

## 実Fresh UI

正規の「はじめから」→プロローグ→QA_C844名前登録→無料10連→SSRミヤビLv.7→5人おまかせ編成→新宿派遣→無料時短→戦闘→VICTORY Result→完了案内→世界紹介3画面→アカウント保存案内まで、同一ユーザーの実画面で進行。
ゲーム進行・ガチャ結果・装備・Battle Resultは注入していない。ガチャ演出SKIPは使用したが、戦闘SKIPは表示されていない。

| 確認 | 実測結果 | 証跡 |
|---|---|---|
| 初期装備 | 5件 / receipt GRANTED | ../db-live/fresh-auth-completion.json |
| 通常攻撃 | Kenji→Kenji、823 damage、HP 5,107→4,284 | hit-B3.png / hit-summary.json |
| Skill命中 | Miyabi→Serika、2,074 damage、HP 5,227→3,153 | hit-B4.png / hit-summary.json |
| 命中画像 | street-impact.webpのロード・可視状態・対象上の画像を確認 | hit-frames.json / 命中画像2枚 |
| cut-in解除 | Skill cut-inを先行観測し、命中時は非表示 | hit-summary.json |
| 戦闘SKIP | 217 DOM観測点すべて非表示 | hit-frames.json |
| Result継続 | VICTORY→次へ→完了案内→世界紹介→認証案内 | result.png / result-continuation.png |
| 通常UI再ログイン | 正規ログアウト→データをお持ちの方→メールでログイン→QA_C844 Home | ../db-live/ui-relogin-readback.json |
| 装備保持 | 同じ5 UUID / receipt全項目一致、追加付与なし | ../db-live/ui-relogin-readback.json |
| Character HOME | ミヤビLv.7、総合力31,151 | character-home.png |
| Character装備 | ミヤビ装備0/7、素体値と加算の表示 | character-equipment.png |
| Party / カード枠 | ミヤビ・ジフン・ケンジ・マサト・リキ、総合力80,041、共通枠描画 | character-party.png |
| 人の統合受入 | 未実施 | 同じ固定URLでCharacterとまとめる |

## 認証の境界と途中観測

アカウント保存案内までは実Fresh UI。その後の資格はQA Adminで同UIDにemail_confirm/passwordを準備した。外部メール送信なし。
準備時点でブラウザには古い匿名セッションが残っていたため「そのまま続ける」はcurrent anonymous accountエラーとなり、認証完了後の古いセッション再開では整合性エラーになった。QA Adminと匿名ブラウザキャッシュの行き違いであり、通常guest導線の製品不具合と断定しない。今回guest保留経路をPASSとしない。

認証完了は同UIDの実password HTTP signin→正規complete_tutorial_authentication({p_auth_method:'EMAIL'})を利用。進行tableの直接更新なし。
正常結果 AUTHENTICATION / gameplay_authorized=true / authentication_pending=false / identity_integrity_valid=true。
HTTP logout/reloginと装備確認後、実画面でも「ログアウトして戻る」→確認OK→通常メールログインに成功し、HomeとCharacterを表示した。

ゲームFreshと通常再ログインUIは実測、最後の新規認証登録工程はQA準備＋HTTP完了。実メール配送・OAuth・ブラウザ上の新規資格登録は未実施として分離する。資格・tokenは証跡やcommitに含めない。

## 人の受入へ

同一候補のCharacter HOME・装備・Party・共通カード枠と、通常攻撃/Skill命中画像、HP/数値同期、cut-in解除、Result継続を一括確認する。新規データから認証まで確認する場合はQA Adminによる途中資格変更を挟まない。公開設定承認と統合受入までProductionへ反映しない。
