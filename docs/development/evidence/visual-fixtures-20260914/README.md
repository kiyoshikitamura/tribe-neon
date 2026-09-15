# Preview fixture表示確認（2026-09-14）

対象: https://tribe-neon-53k0uvl5l-kiyoshi-kitamura.vercel.app/qa/presentation

## 範囲と制限
- Chrome実ブラウザ、認証不要fixtureのみ。実APIのActivityシナリオ、ログイン、ゲーム資産操作は実行していない。
- ブラウザviewportは1363×936。提供されたブラウザAPIにviewport変更機能がなく、依頼された390px幅は未確認。430pxゲーム枠での表示確認を390px受入と扱わない。
- 現在の配信済みPreviewの確認であり、未配信のintegration変更の確認ではない。
- 本人実機デザイン受入、実データのLeader整合受入は未実施。

## 確認結果
| scenario | 結果 | 証拠 |
|---|---|---|
| first-home-fresh | Home430px枠表示、main幅とscroll幅430で横溢れなし。小Raidなし、大Raid保持。Leader画像表示。fixtureのRPは現在値がundefinedで「/5」と表示される | home.jpg |
| card-visual-skill-levels | +1〜+10表示、Skill Lv表示なし。10枚描画、長名は省略。画像欠落なし | skill.jpg |
| public-user-profile | 公開プロフィール430px、scroll幅428。肖像・5人編成・総合力表示、画像欠落なし | leader.jpg |

全3画面のdocument.scrollWidthとinnerWidthは1363で一致。取得したconsole error/warnはブラウザ拡張のmetadata送信エラーのみ（chrome-extension URL）。取得範囲でアプリ由来console errorなし。

専用目元10人は未接続。Emblem採用7都市＋限定1位素材も未統合。素材取得HTTP502のため画像/CSS変更なし。
