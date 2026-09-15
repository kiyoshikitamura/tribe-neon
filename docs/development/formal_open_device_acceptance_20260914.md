# Formal Open前 実機確認セット

対象SHA: `ec6c7d2e0c2917b4923df3af85bf80fcd9325152`。本流で別のURLが指定された場合は、その確認依頼を優先する。

Preview: https://tribe-neon-c81xlzaib-kiyoshi-kitamura.vercel.app/

## 先に確認する表示

iPhone Safari等、普段プレイする端末で確認。端末名・ブラウザ名と、問題画面のスクリーンショットを添える。ログイン不要の下記fixtureは表示用で、ボタンの一部はゲームへ遷移しない。実データの動作確認とは区別する。

| URLの末尾 | 確認すること | 期待結果 |
|---|---|---|
| `/qa/presentation?scenario=first-home-fresh` | Homeの最上部から最下部、バナー左右操作 | 文字・顔・フッターの見切れなし、横スクロールなし。小Raidなし、大Raidあり。バナー切替可能 |
| `/qa/presentation?scenario=card-visual-skill-levels` | Skill結果10枚 | +1〜+10表示、Skill Lv表示なし。カードや戻るボタンが見切れない |
| `/qa/presentation?scenario=public-user-profile` | 公開プロフィールと閉じる操作 | 肖像・編成・総合力を読める。閉じるボタンを押せる |

Home fixtureのRP欠損は対象SHAで修正済み（3/5）。実データのRPとは区別する。

## 既存Preview QAアカウントで確認

上記Previewルートへ、既存のPreview QAアカウントでログイン。本番アカウントのデータがそのまま存在するとは限らない。認証手段がない場合はタイトル確認までで止め、パスワード等を報告に書かない。

| 対象 | 操作 | 期待結果 |
|---|---|---|
| MyPage | 各導線と戻る操作 | タップ可能、画面復帰可能。小Raidなし、他Raid導線は維持 |
| Skill | 一覧・詳細・編成・準備画面 | Skillは+値表示。Character/EquipmentのLvは正常に残る |
| Leader | お気に入りと編成先頭を別キャラにして表示確認 | MyPage/Character/Public Profileはお気に入りが一致。編成先頭をLeader扱いしない |
| Quest難度 | 入場、街変更、クリア済み難度の選択 | 初級が初期選択。初/中/上が見える。未開放のみ操作不可 |
| Present | 開く、閉じる、再読込 | 架空アンケートのお礼なし。正規Presentは残る |

## 実ゲーム動作（Preview QAデータを消費・更新する）

下記は単なるデザイン確認と分け、使用するQAアカウント・所持資源を確認して実施する。未実施は未実施と記録する。

| 対象 | 操作 | 期待結果 |
|---|---|---|
| 編成 | Party保存→再読込→Quest/PvP/Raid準備と実戦 | 5人・Skill・Equipmentが保存済みMainと一致。Quest派遣1人と混同しない |
| Raid Mission | 実戦を正式完了→Missionを見る | Raid回数進捗が1回増える。再表示で追加加算しない |
| 報酬 | Quest/Raid等の通常報酬獲得前後を比較 | 対象報酬がBag/資産へ即反映、Resultと一致、Present新規配送なし |
| 新規導線 | 新規QA作成が必要な場合だけ別途実施 | TutorialからHomeまで継続。新規登録・資産初期化を既存QAの確認と混ぜない |

再送・失敗時rollback等は技術検証側が担当。端末で無理に再現させない。

## 今回PASSを求めない範囲

- 未完成のCharacter/Equipment EXP、未接続の専用目元/新Emblem。
- Stripe実決済、Season切替、仕様未確定のPool。別系統の受入結果を待つ。
- fixtureだけで実ゲーム動作、DB整合、本人のデザイン承認をPASSにしない。

## 報告フォーム

```text
対象URL / SHA:
端末 / OS / ブラウザ:
確認区分: fixture / 既存QA / 新規QA
項目:
結果: OK / NG / 未実施
操作順:
期待した表示・動作:
実際の表示・動作:
スクリーンショット・動画:
```
